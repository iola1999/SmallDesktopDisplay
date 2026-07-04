import type {DeviceRegistry} from "../state.js";
import {
  EnvelopeParser,
  MSG_COMMAND,
  MSG_DEVICE_HELLO,
  MSG_FRAME,
  MSG_FRAME_ACK,
  MSG_HELLO,
  MSG_INPUT,
  MSG_STATUS,
  encodeEnvelope,
} from "./envelope.js";

// 与 node:serialport 的 SerialPort 结构兼容的最小接口；测试里用假端口注入。
export interface SerialPortLike {
  write(data: Buffer): unknown;
  on(event: "data", listener: (chunk: Buffer) => void): unknown;
  on(event: "close", listener: () => void): unknown;
  on(event: "error", listener: (error: Error) => void): unknown;
}

export interface SerialTransportOptions {
  registry: DeviceRegistry;
  port: SerialPortLike;
  log?: (line: string) => void;
  // 设备静默期宿主机的 HELLO 探测间隔。
  helloIntervalMs?: number;
  // 推帧后等待 frame_ack 的超时；超时视为链路断开，回到探测状态。
  ackTimeoutMs?: number;
  // 命令通道的兜底扫描间隔（正常靠 ack/input/status 事件触发）。
  commandCheckIntervalMs?: number;
  // 帧泵长轮询 registry 的停靠时长。
  framePollWaitMs?: number;
}

// 串口传输的宿主机端：设备 HELLO 建立链路后，用与 HTTP 完全相同的
// registry 语义推帧——getFrameWithStats(deviceId, have, wait) 停靠出帧就写，
// 收到 frame_ack 才推进 have（停等，天然背压）。输入/状态上行转 registry，
// 命令队列有更新就主动下推，无需设备轮询。
export class SerialTransport {
  private readonly registry: DeviceRegistry;
  private readonly port: SerialPortLike;
  private readonly log: (line: string) => void;
  private readonly helloIntervalMs: number;
  private readonly ackTimeoutMs: number;
  private readonly commandCheckIntervalMs: number;
  private readonly framePollWaitMs: number;

  private readonly parser = new EnvelopeParser();
  private deviceId: string | null = null;
  private have = 0;
  private linkUp = false;
  private pumping = false;
  private stopped = false;
  private lastCommandSent = 0;
  private ackWaiter: {resolve: (frameId: number | null) => void; timer: NodeJS.Timeout} | null = null;
  private helloTimer: NodeJS.Timeout | null = null;
  private commandTimer: NodeJS.Timeout | null = null;

  constructor(options: SerialTransportOptions) {
    this.registry = options.registry;
    this.port = options.port;
    this.log = options.log ?? ((line) => console.log(line));
    this.helloIntervalMs = options.helloIntervalMs ?? 2000;
    this.ackTimeoutMs = options.ackTimeoutMs ?? 2000;
    this.commandCheckIntervalMs = options.commandCheckIntervalMs ?? 250;
    this.framePollWaitMs = options.framePollWaitMs ?? 1000;
  }

  start(): void {
    this.port.on("data", (chunk) => this.handleData(chunk));
    this.port.on("error", (error) => {
      this.log(`[Serial] port error: ${error.message}`);
      this.dropLink("port error");
    });
    this.port.on("close", () => {
      this.log("[Serial] port closed");
      this.stopped = true;
      this.dropLink("port closed");
      this.clearTimers();
    });
    // 设备可能先于服务开机而错过我们的启动窗口：周期性 HELLO 探测，
    // 设备（WiFi 模式下也在被动监听）见到即回 HELLO 建链。
    this.helloTimer = setInterval(() => {
      if (!this.linkUp && !this.stopped) {
        this.safeWrite(encodeEnvelope(MSG_HELLO, Buffer.from(JSON.stringify({proto: 1}))));
      }
    }, this.helloIntervalMs);
    this.commandTimer = setInterval(() => this.pushCommandIfAny(), this.commandCheckIntervalMs);
  }

  stop(): void {
    this.stopped = true;
    this.dropLink("stopped");
    this.clearTimers();
  }

  isLinkUp(): boolean {
    return this.linkUp;
  }

  private clearTimers(): void {
    if (this.helloTimer !== null) clearInterval(this.helloTimer);
    if (this.commandTimer !== null) clearInterval(this.commandTimer);
    this.helloTimer = null;
    this.commandTimer = null;
  }

  private dropLink(reason: string): void {
    if (this.linkUp) {
      this.log(`[Serial] link down (${reason})`);
    }
    this.linkUp = false;
    if (this.ackWaiter !== null) {
      clearTimeout(this.ackWaiter.timer);
      this.ackWaiter.resolve(null);
      this.ackWaiter = null;
    }
  }

  private handleData(chunk: Buffer): void {
    for (const event of this.parser.feed(chunk)) {
      if (event.kind === "log") {
        this.log(`[device] ${event.line}`);
        continue;
      }
      this.handleMessage(event.type, event.payload);
    }
  }

  private handleMessage(type: number, payload: Buffer): void {
    let body: Record<string, unknown>;
    try {
      body = payload.length === 0 ? {} : (JSON.parse(payload.toString("utf8")) as Record<string, unknown>);
    } catch {
      this.log("[Serial] dropped message with invalid JSON payload");
      return;
    }

    switch (type) {
      case MSG_DEVICE_HELLO: {
        const deviceId = typeof body.device_id === "string" && body.device_id.length > 0 ? body.device_id : null;
        if (deviceId === null) {
          this.log("[Serial] device hello without device_id");
          return;
        }
        this.deviceId = deviceId;
        // 每次 HELLO 都视为设备侧重新建链（开机/横幅恢复/宿主机重启探测），
        // have 归零让第一帧走全屏，清掉设备屏幕上任何本地状态文本。
        this.have = 0;
        this.linkUp = true;
        // 设备在等待 ACK 期间重启重连：用 -1 解除挂起的等待（帧泵继续、
        // 不判为超时断链），have 已归零，下一帧自动是全屏。
        if (this.ackWaiter !== null) {
          const waiter = this.ackWaiter;
          this.ackWaiter = null;
          clearTimeout(waiter.timer);
          waiter.resolve(-1);
        }
        this.log(`[Serial] link up: ${deviceId}`);
        void this.pump();
        this.pushCommandIfAny();
        return;
      }

      case MSG_FRAME_ACK: {
        const frameId = typeof body.frame_id === "number" && Number.isInteger(body.frame_id) ? body.frame_id : null;
        if (frameId !== null && this.ackWaiter !== null) {
          const waiter = this.ackWaiter;
          this.ackWaiter = null;
          clearTimeout(waiter.timer);
          waiter.resolve(frameId);
          return;
        }
        // 迟到/孤儿 ACK（等待者已超时或被 HELLO 解除）：直接吸收为 have 水位，
        // 避免下一轮重推设备已持有的帧（曾观测到 stale partial 重推）。
        this.log(`[Serial] orphan ack frame_id=${String(frameId)} (no waiter), adopting`);
        if (frameId !== null && frameId >= 0) {
          this.have = frameId;
        }
        return;
      }

      case MSG_INPUT: {
        if (this.deviceId === null) return;
        const seq = body.seq;
        const event = body.event;
        const uptime = body.uptime_ms ?? 0;
        if (
          typeof seq === "number" &&
          Number.isInteger(seq) &&
          seq >= 1 &&
          (event === "short_press" || event === "double_press" || event === "long_press") &&
          typeof uptime === "number"
        ) {
          this.registry.recordInput(this.deviceId, seq, event, uptime);
          this.pushCommandIfAny();
        }
        return;
      }

      case MSG_STATUS: {
        if (this.deviceId === null) return;
        const brightness = body.brightness;
        const uptime = body.uptime_ms;
        if (typeof brightness !== "number" || !Number.isInteger(brightness) || brightness < 0 || brightness > 100) return;
        if (typeof uptime !== "number" || !Number.isInteger(uptime) || uptime < 0) return;
        this.registry.recordStatus(this.deviceId, {
          brightness,
          uptimeMs: uptime,
          heapFree: asNonNegativeInt(body.heap_free),
          heapMaxBlock: asNonNegativeInt(body.heap_max_block),
          heapFragmentation: Math.min(100, asNonNegativeInt(body.heap_fragmentation)),
          wifiRssi: typeof body.wifi_rssi === "number" && Number.isInteger(body.wifi_rssi) ? body.wifi_rssi : 0,
        });
        this.pushCommandIfAny();
        return;
      }

      default:
        // COMMAND_ACK 等：目前只用于日志观测。
        return;
    }
  }

  // 帧泵：停等推送。registry 的调度逻辑（翻牌 20fps、雨滴秒中帧、每秒刷新）
  // 原样生效——串口只是替代了 HTTP 长轮询这一层传输。
  private async pump(): Promise<void> {
    if (this.pumping) {
      return;
    }
    this.pumping = true;
    this.log(`[Serial] pump start have=${this.have}`);
    try {
      while (this.linkUp && !this.stopped && this.deviceId !== null) {
        const result = await this.registry.getFrameWithStats(this.deviceId, this.have, this.framePollWaitMs);
        if (!this.linkUp || this.stopped) {
          break;
        }
        if (result.frame === null) {
          continue;
        }
        this.safeWrite(encodeEnvelope(MSG_FRAME, result.frame));
        const acked = await this.waitForAck();
        if (!this.linkUp || this.stopped) {
          break;
        }
        if (acked === null) {
          // 超时：链路可疑，回到 HELLO 探测状态；设备重新 HELLO 后再建链。
          this.dropLink("frame ack timeout");
          break;
        }
        if (acked >= 0) {
          // 设备报告它当前持有的帧（成功=刚推的帧 id；失败=旧 id → registry
          // 自动给出 catch-up/全屏纠正）。-1 表示链路重建，have 已被 HELLO 归零。
          this.have = acked;
        }
      }
    } catch (error) {
      this.log(`[Serial] pump error: ${String(error)}`);
      this.dropLink("pump error");
    } finally {
      this.pumping = false;
      this.log(`[Serial] pump exit linkUp=${this.linkUp} have=${this.have}`);
    }
  }

  private waitForAck(): Promise<number | null> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (this.ackWaiter !== null) {
          this.ackWaiter = null;
          resolve(null);
        }
      }, this.ackTimeoutMs);
      this.ackWaiter = {resolve, timer};
    });
  }

  private pushCommandIfAny(): void {
    if (!this.linkUp || this.stopped || this.deviceId === null) {
      return;
    }
    const command = this.registry.getCommand(this.deviceId, this.lastCommandSent);
    if (command === null) {
      return;
    }
    this.lastCommandSent = command.id;
    const body = JSON.stringify({id: command.id, type: command.type, value: command.value, persist: command.persist});
    this.safeWrite(encodeEnvelope(MSG_COMMAND, Buffer.from(body)));
    this.log(`[Serial] pushed command id=${command.id} ${command.type}=${command.value}`);
  }

  private safeWrite(data: Buffer): void {
    try {
      this.port.write(data);
    } catch (error) {
      this.log(`[Serial] write failed: ${String(error)}`);
      this.dropLink("write failed");
    }
  }
}

function asNonNegativeInt(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : 0;
}
