import {describe, expect, test, vi} from "vitest";

import {DeviceRegistry} from "../state.js";
import {
  ENVELOPE_HEADER_SIZE,
  EnvelopeParser,
  MSG_COMMAND,
  MSG_DEVICE_HELLO,
  MSG_FRAME,
  MSG_FRAME_ACK,
  MSG_HELLO,
  MSG_INPUT,
  encodeEnvelope,
} from "./envelope.js";
import {SerialTransport, type SerialPortLike} from "./serial-transport.js";

// 宿主机视角的假串口：记录下行写入，可注入上行字节。
class FakePort implements SerialPortLike {
  written: Buffer[] = [];
  private handlers: {data: Array<(chunk: Buffer) => void>; close: Array<() => void>; error: Array<(error: Error) => void>} = {
    data: [],
    close: [],
    error: [],
  };

  write(data: Buffer): boolean {
    this.written.push(Buffer.from(data));
    return true;
  }

  on(event: "data", listener: (chunk: Buffer) => void): this;
  on(event: "close", listener: () => void): this;
  on(event: "error", listener: (error: Error) => void): this;
  on(event: "data" | "close" | "error", listener: (...args: never[]) => void): this {
    (this.handlers[event] as Array<(...args: never[]) => void>).push(listener);
    return this;
  }

  emitData(chunk: Buffer): void {
    for (const listener of this.handlers.data) {
      listener(chunk);
    }
  }

  // 下行字节流 → 消息列表（用与设备相同的解析器解码，验证线格式自洽）。
  decodeWritten(): Array<{type: number; payload: Buffer}> {
    const parser = new EnvelopeParser(new Set([MSG_FRAME, MSG_COMMAND, MSG_HELLO]), 1024 * 1024);
    const messages: Array<{type: number; payload: Buffer}> = [];
    for (const chunk of this.written) {
      for (const event of parser.feed(chunk)) {
        if (event.kind === "message") {
          messages.push({type: event.type, payload: event.payload});
        }
      }
    }
    return messages;
  }
}

function deviceHello(deviceId = "desk-serial"): Buffer {
  return encodeEnvelope(MSG_DEVICE_HELLO, Buffer.from(JSON.stringify({device_id: deviceId, proto: 1})));
}

function frameAck(frameId: number): Buffer {
  return encodeEnvelope(MSG_FRAME_ACK, Buffer.from(JSON.stringify({frame_id: frameId})));
}

async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  await vi.waitFor(
    () => {
      if (!predicate()) {
        throw new Error("condition not met");
      }
    },
    {timeout: timeoutMs, interval: 5},
  );
}

describe("serial transport", () => {
  test("device hello brings the link up and pushes a full frame; ack advances have", async () => {
    const registry = new DeviceRegistry();
    const port = new FakePort();
    const transport = new SerialTransport({registry, port, log: () => {}, framePollWaitMs: 20, ackTimeoutMs: 500});
    transport.start();

    port.emitData(deviceHello());
    await waitFor(() => port.decodeWritten().some((message) => message.type === MSG_FRAME));

    // 设备 HELLO 必须得到即时 HELLO 回应：设备开机探测窗只有 1.5s，
    // 不能等帧泵从上一轮停靠里转出来。
    expect(port.decodeWritten().some((message) => message.type === MSG_HELLO)).toBe(true);

    const frames = port.decodeWritten().filter((message) => message.type === MSG_FRAME);
    expect(frames).toHaveLength(1);
    const sdd1 = frames[0].payload;
    expect(sdd1.subarray(0, 4).toString("ascii")).toBe("SDD1");
    expect(sdd1[5] & 0x01).toBe(0x01); // 建链第一帧必是全屏
    const frameId = sdd1.readUInt32LE(8);

    // ACK 后 have 前进：同一秒内没有新帧，泵停在长轮询里，不重复推同一帧
    port.emitData(frameAck(frameId));
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(port.decodeWritten().filter((message) => message.type === MSG_FRAME)).toHaveLength(1);
    expect(transport.isLinkUp()).toBe(true);

    transport.stop();
  });

  test("uplink input events reach the registry and trigger command push", async () => {
    const registry = new DeviceRegistry();
    const port = new FakePort();
    const transport = new SerialTransport({
      registry,
      port,
      log: () => {},
      framePollWaitMs: 20,
      ackTimeoutMs: 500,
      commandCheckIntervalMs: 10,
    });
    transport.start();
    port.emitData(deviceHello("desk-serial-input"));
    await waitFor(() => port.decodeWritten().some((message) => message.type === MSG_FRAME));

    // 手势：进设置 → 进亮度详情 → 调亮度（会入队 set_brightness 命令）
    const input = (seq: number, event: string) =>
      port.emitData(encodeEnvelope(MSG_INPUT, Buffer.from(JSON.stringify({seq, event, uptime_ms: seq * 100}))));
    input(1, "long_press");
    input(2, "long_press");
    input(3, "short_press");

    expect(registry.devices.get("desk-serial-input")!.ui.page).toBe("detail");
    await waitFor(() => port.decodeWritten().some((message) => message.type === MSG_COMMAND));

    const command = port.decodeWritten().find((message) => message.type === MSG_COMMAND)!;
    expect(JSON.parse(command.payload.toString("utf8"))).toMatchObject({id: 1, type: "set_brightness"});

    transport.stop();
  });

  test("missing ack drops the link and resumes hello probing; re-hello restarts with a full frame", async () => {
    const registry = new DeviceRegistry();
    const port = new FakePort();
    const transport = new SerialTransport({
      registry,
      port,
      log: () => {},
      framePollWaitMs: 20,
      ackTimeoutMs: 50,
      helloIntervalMs: 30,
    });
    transport.start();

    port.emitData(deviceHello("desk-serial-timeout"));
    await waitFor(() => port.decodeWritten().some((message) => message.type === MSG_FRAME));

    // 不回 ACK → 链路判死，恢复周期性 HELLO 探测
    await waitFor(() => !transport.isLinkUp());
    const framesBefore = port.decodeWritten().filter((message) => message.type === MSG_FRAME).length;
    await waitFor(() => port.decodeWritten().some((message) => message.type === MSG_HELLO));

    // 设备重新 HELLO：链路重建，再次收到全屏帧
    port.emitData(deviceHello("desk-serial-timeout"));
    await waitFor(() => port.decodeWritten().filter((message) => message.type === MSG_FRAME).length > framesBefore);
    const frames = port.decodeWritten().filter((message) => message.type === MSG_FRAME);
    expect(frames[frames.length - 1].payload[5] & 0x01).toBe(0x01);

    transport.stop();
  });

  test("device log text on the wire is forwarded to the host log", async () => {
    const registry = new DeviceRegistry();
    const port = new FakePort();
    const lines: string[] = [];
    const transport = new SerialTransport({registry, port, log: (line) => lines.push(line), framePollWaitMs: 20});
    transport.start();

    port.emitData(Buffer.from("[RemoteInput] serial seq=3 event=short_press\n", "utf8"));
    expect(lines).toContain("[device] [RemoteInput] serial seq=3 event=short_press");

    transport.stop();
  });

  test("hello during pending ack rebuilds the link instead of killing it", async () => {
    const registry = new DeviceRegistry();
    const port = new FakePort();
    const transport = new SerialTransport({
      registry,
      port,
      log: () => {},
      framePollWaitMs: 20,
      ackTimeoutMs: 500,
    });
    transport.start();

    port.emitData(deviceHello("desk-serial-reboot"));
    await waitFor(() => port.decodeWritten().some((message) => message.type === MSG_FRAME));

    // 设备在未 ACK 时重启并重新 HELLO：have 归零，新的全屏帧到来，链路保持
    port.emitData(deviceHello("desk-serial-reboot"));
    await waitFor(() => port.decodeWritten().filter((message) => message.type === MSG_FRAME).length >= 2);
    expect(transport.isLinkUp()).toBe(true);

    const frames = port.decodeWritten().filter((message) => message.type === MSG_FRAME);
    expect(frames[frames.length - 1].payload[5] & 0x01).toBe(0x01);

    transport.stop();
  });
});
