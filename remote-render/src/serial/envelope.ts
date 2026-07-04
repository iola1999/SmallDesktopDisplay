import zlib from "node:zlib";

// 串口消息信封（与固件 src/remote/SerialProtocol.h 镜像）：
//
//   magic0   u8     0xA5
//   magic1   u8     0x5A
//   type     u8
//   length   u32le  payload 字节数
//   crc32    u32le  payload 的 CRC32（zlib 多项式，与 SDD1 内层一致）
//   payload  length 字节
//
// 信封之间允许出现裸日志文本：固件的 Serial.printf 原样保留在线上，宿主机把
// 非信封字节按日志行透传（等价于以前的串口监视器体验）。

export const SERIAL_MAGIC0 = 0xa5;
export const SERIAL_MAGIC1 = 0x5a;
export const ENVELOPE_HEADER_SIZE = 11;

// 下行（宿主机 → 设备）
export const MSG_FRAME = 0x01;
export const MSG_COMMAND = 0x02;
export const MSG_HELLO = 0x03;
// 上行（设备 → 宿主机）
export const MSG_DEVICE_HELLO = 0x81;
export const MSG_INPUT = 0x82;
export const MSG_STATUS = 0x83;
export const MSG_FRAME_ACK = 0x84;
export const MSG_COMMAND_ACK = 0x85;

export const UPLINK_TYPES: ReadonlySet<number> = new Set([MSG_DEVICE_HELLO, MSG_INPUT, MSG_STATUS, MSG_FRAME_ACK, MSG_COMMAND_ACK]);

// 上行都是小 JSON；给设备侧未来的扩展留一点余量。
const DEFAULT_MAX_PAYLOAD = 4096;
// 无换行符的日志字节积攒上限，防止二进制噪声无限占用内存。
const LOG_FLUSH_BYTES = 512;

export function encodeEnvelope(type: number, payload: Buffer): Buffer {
  const out = Buffer.alloc(ENVELOPE_HEADER_SIZE + payload.length);
  out[0] = SERIAL_MAGIC0;
  out[1] = SERIAL_MAGIC1;
  out[2] = type;
  out.writeUInt32LE(payload.length, 3);
  out.writeUInt32LE(zlib.crc32(payload) >>> 0, 7);
  payload.copy(out, ENVELOPE_HEADER_SIZE);
  return out;
}

export type SerialEvent = {kind: "message"; type: number; payload: Buffer} | {kind: "log"; line: string};

// 分块字节流 → 消息/日志行 事件。重同步策略：候选 magic 处头部非法或 CRC
// 不匹配时，仅把 1 个字节当作垃圾滑过，保证内嵌在噪声里的真信封不会被跳过。
export class EnvelopeParser {
  private pending: Buffer = Buffer.alloc(0);
  private logBytes: number[] = [];

  constructor(
    private readonly acceptTypes: ReadonlySet<number> = UPLINK_TYPES,
    private readonly maxPayload = DEFAULT_MAX_PAYLOAD,
  ) {}

  feed(chunk: Buffer): SerialEvent[] {
    this.pending = this.pending.length === 0 ? chunk : Buffer.concat([this.pending, chunk]);
    const events: SerialEvent[] = [];
    let offset = 0;

    for (;;) {
      const magicAt = this.findMagic(offset);
      if (magicAt === -1) {
        // 尾部可能是被切开的 magic 前半个字节，留到下一块
        const keepFrom = this.pending.length > 0 && this.pending[this.pending.length - 1] === SERIAL_MAGIC0 ? this.pending.length - 1 : this.pending.length;
        this.consumeAsLog(offset, keepFrom, events);
        this.pending = this.pending.subarray(keepFrom);
        break;
      }
      this.consumeAsLog(offset, magicAt, events);

      if (this.pending.length - magicAt < ENVELOPE_HEADER_SIZE) {
        this.pending = this.pending.subarray(magicAt);
        break;
      }
      const type = this.pending[magicAt + 2];
      const length = this.pending.readUInt32LE(magicAt + 3);
      const crc = this.pending.readUInt32LE(magicAt + 7);
      if (!this.acceptTypes.has(type) || length > this.maxPayload) {
        // 假 magic：滑过 1 字节继续找
        this.logBytes.push(this.pending[magicAt]);
        offset = magicAt + 1;
        continue;
      }
      if (this.pending.length - magicAt - ENVELOPE_HEADER_SIZE < length) {
        this.pending = this.pending.subarray(magicAt);
        break;
      }
      const payload = this.pending.subarray(magicAt + ENVELOPE_HEADER_SIZE, magicAt + ENVELOPE_HEADER_SIZE + length);
      if ((zlib.crc32(payload) >>> 0) !== crc) {
        this.logBytes.push(this.pending[magicAt]);
        offset = magicAt + 1;
        continue;
      }
      // subarray 引用 pending 的底层内存，拷贝一份避免后续 feed 覆写
      events.push({kind: "message", type, payload: Buffer.from(payload)});
      offset = magicAt + ENVELOPE_HEADER_SIZE + length;
    }
    return events;
  }

  private findMagic(from: number): number {
    for (let index = from; index + 1 < this.pending.length; index += 1) {
      if (this.pending[index] === SERIAL_MAGIC0 && this.pending[index + 1] === SERIAL_MAGIC1) {
        return index;
      }
    }
    return -1;
  }

  private consumeAsLog(from: number, to: number, events: SerialEvent[]): void {
    for (let index = from; index < to; index += 1) {
      const byte = this.pending[index];
      if (byte === 0x0a) {
        this.flushLogLine(events);
        continue;
      }
      this.logBytes.push(byte);
      if (this.logBytes.length >= LOG_FLUSH_BYTES) {
        this.flushLogLine(events);
      }
    }
  }

  private flushLogLine(events: SerialEvent[]): void {
    if (this.logBytes.length === 0) {
      return;
    }
    const line = Buffer.from(this.logBytes).toString("utf8").replace(/\r+$/, "");
    this.logBytes = [];
    if (line.trim().length > 0) {
      events.push({kind: "log", line});
    }
  }
}
