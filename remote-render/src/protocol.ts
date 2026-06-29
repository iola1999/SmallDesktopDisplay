import zlib from "node:zlib";

export const MAGIC = "SDD1";
export const VERSION = 1;
export const HEADER_LEN = 32;
export const FORMAT_RGB565 = 1;
export const ENCODING_RAW = 0;
export const ENCODING_RGB565_RLE = 1;
export const FLAG_FULL_FRAME = 0x01;
export const FLAG_RESET_REQUIRED = 0x02;

export class FrameRect {
  constructor(
    public x: number,
    public y: number,
    public width: number,
    public height: number,
    public payload: Buffer,
    public encoding: number = ENCODING_RAW,
    public format: number = FORMAT_RGB565,
  ) {}
}

export interface EncodeFrameOptions {
  frameId: number;
  baseFrameId: number;
  width: number;
  height: number;
  rects: FrameRect[];
  fullFrame?: boolean;
  resetRequired?: boolean;
}

export function rgb888ToRgb565(rgb: Buffer | Uint8Array): Buffer {
  if (rgb.length % 3 !== 0) {
    throw new Error("RGB888 payload length must be divisible by 3");
  }

  const out = Buffer.alloc((rgb.length / 3) * 2);
  let outIndex = 0;
  for (let index = 0; index < rgb.length; index += 3) {
    const red = rgb[index];
    const green = rgb[index + 1];
    const blue = rgb[index + 2];
    const value = ((red & 0xf8) << 8) | ((green & 0xfc) << 3) | (blue >> 3);
    out[outIndex] = value & 0xff;
    out[outIndex + 1] = (value >> 8) & 0xff;
    outIndex += 2;
  }
  return out;
}

export function rgbaToRgb565(rgba: Buffer | Uint8Array): Buffer {
  if (rgba.length % 4 !== 0) {
    throw new Error("RGBA payload length must be divisible by 4");
  }

  const out = Buffer.alloc((rgba.length / 4) * 2);
  let outIndex = 0;
  for (let index = 0; index < rgba.length; index += 4) {
    const red = rgba[index];
    const green = rgba[index + 1];
    const blue = rgba[index + 2];
    const value = ((red & 0xf8) << 8) | ((green & 0xfc) << 3) | (blue >> 3);
    out[outIndex] = value & 0xff;
    out[outIndex + 1] = (value >> 8) & 0xff;
    outIndex += 2;
  }
  return out;
}

export function encodeRgb565Rle(rgb565: Buffer | Uint8Array): Buffer {
  if (rgb565.length % 2 !== 0) {
    throw new Error("RGB565 payload length must be even");
  }
  if (rgb565.length === 0) {
    return Buffer.alloc(0);
  }

  // 最坏情况（无重复）每像素 3 字节，预分配后直接写入，避免构建 number[] 再拷贝。
  const out = Buffer.allocUnsafe((rgb565.length / 2) * 3);
  let outIndex = 0;
  let runLo = rgb565[0];
  let runHi = rgb565[1];
  let runLength = 1;
  for (let index = 2; index < rgb565.length; index += 2) {
    const lo = rgb565[index];
    const hi = rgb565[index + 1];
    if (lo === runLo && hi === runHi && runLength < 255) {
      runLength += 1;
      continue;
    }
    out[outIndex++] = runLength;
    out[outIndex++] = runLo;
    out[outIndex++] = runHi;
    runLo = lo;
    runHi = hi;
    runLength = 1;
  }
  out[outIndex++] = runLength;
  out[outIndex++] = runLo;
  out[outIndex++] = runHi;
  return out.subarray(0, outIndex);
}

export function decodeRgb565Rle(payload: Buffer | Uint8Array, expectedPixels: number): Buffer {
  if (payload.length % 3 !== 0) {
    throw new Error("RGB565 RLE payload length must be divisible by 3");
  }

  const out = Buffer.alloc(expectedPixels * 2);
  let outIndex = 0;
  for (let index = 0; index < payload.length; index += 3) {
    const runLength = payload[index];
    if (runLength === 0) {
      throw new Error("RGB565 RLE run length must be positive");
    }
    for (let repeat = 0; repeat < runLength; repeat += 1) {
      if (outIndex + 2 > out.length) {
        throw new Error("RGB565 RLE decoded length does not match geometry");
      }
      out[outIndex] = payload[index + 1];
      out[outIndex + 1] = payload[index + 2];
      outIndex += 2;
    }
  }
  if (outIndex !== expectedPixels * 2) {
    throw new Error("RGB565 RLE decoded length does not match geometry");
  }
  return out;
}

export function compressRectIfSmaller(rect: FrameRect): FrameRect {
  if (rect.format !== FORMAT_RGB565 || rect.encoding !== ENCODING_RAW) {
    return rect;
  }
  const compressed = encodeRgb565Rle(rect.payload);
  if (compressed.length >= rect.payload.length) {
    return rect;
  }
  return new FrameRect(rect.x, rect.y, rect.width, rect.height, compressed, ENCODING_RGB565_RLE, rect.format);
}

export function encodeFrame(options: EncodeFrameOptions): Buffer {
  const rects = options.rects;
  const bodyParts: Buffer[] = [];
  let totalPayloadLength = 0;

  for (const rect of rects) {
    validateRect(options.width, options.height, rect);
    totalPayloadLength += rect.payload.length;
    const rectHeader = Buffer.alloc(16);
    rectHeader.writeUInt16LE(rect.x, 0);
    rectHeader.writeUInt16LE(rect.y, 2);
    rectHeader.writeUInt16LE(rect.width, 4);
    rectHeader.writeUInt16LE(rect.height, 6);
    rectHeader.writeUInt8(rect.format, 8);
    rectHeader.writeUInt8(rect.encoding, 9);
    rectHeader.writeUInt16LE(0, 10);
    rectHeader.writeUInt32LE(rect.payload.length, 12);
    bodyParts.push(rectHeader, rect.payload);
  }

  const body = Buffer.concat(bodyParts);
  const header = Buffer.alloc(HEADER_LEN);
  header.write(MAGIC, 0, "ascii");
  header.writeUInt8(VERSION, 4);
  let flags = 0;
  if (options.fullFrame) flags |= FLAG_FULL_FRAME;
  if (options.resetRequired) flags |= FLAG_RESET_REQUIRED;
  header.writeUInt8(flags, 5);
  header.writeUInt16LE(HEADER_LEN, 6);
  header.writeUInt32LE(options.frameId, 8);
  header.writeUInt32LE(options.baseFrameId, 12);
  header.writeUInt16LE(options.width, 16);
  header.writeUInt16LE(options.height, 18);
  header.writeUInt16LE(rects.length, 20);
  header.writeUInt32LE(totalPayloadLength, 22);
  header.writeUInt16LE(0, 26);
  header.writeUInt32LE(zlib.crc32(body) >>> 0, 28);

  return Buffer.concat([header, body]);
}

function validateRect(width: number, height: number, rect: FrameRect): void {
  if (rect.x < 0 || rect.y < 0 || rect.width <= 0 || rect.height <= 0) {
    throw new Error("rect geometry is invalid");
  }
  if (rect.x + rect.width > width || rect.y + rect.height > height) {
    throw new Error("rect exceeds frame bounds");
  }
  if (rect.format !== FORMAT_RGB565) {
    throw new Error("only RGB565 rects are supported");
  }
  if (rect.encoding === ENCODING_RAW && rect.payload.length !== rect.width * rect.height * 2) {
    throw new Error("rect payload length does not match geometry");
  }
  if (rect.encoding === ENCODING_RGB565_RLE) {
    decodeRgb565Rle(rect.payload, rect.width * rect.height);
  } else if (rect.encoding !== ENCODING_RAW) {
    throw new Error("unsupported RGB565 rect encoding");
  }
}
