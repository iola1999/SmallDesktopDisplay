import {mkdir, writeFile} from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";
import {createCanvas, ImageData} from "@napi-rs/canvas";

import {decodeRgb565Rle, ENCODING_RAW, ENCODING_RGB565_RLE, FORMAT_RGB565, FLAG_FULL_FRAME} from "../protocol.js";

const FRAME_HEADER_LEN = 32;
const RECT_HEADER_LEN = 16;

export interface DecodedRect {
  x: number;
  y: number;
  width: number;
  height: number;
  payload: Buffer;
  encoding: number;
}

export interface DecodedFrame {
  frameId: number;
  baseFrameId: number;
  width: number;
  height: number;
  fullFrame: boolean;
  rects: DecodedRect[];
}

export function decodeFrame(data: Buffer): DecodedFrame {
  if (data.length < FRAME_HEADER_LEN) throw new Error("frame is shorter than the SDD1 header");
  if (data.subarray(0, 4).toString("ascii") !== "SDD1") throw new Error("frame magic is not SDD1");
  if (data.readUInt8(4) !== 1) throw new Error(`unsupported frame version ${data.readUInt8(4)}`);
  if (data.readUInt16LE(6) !== FRAME_HEADER_LEN) throw new Error("unsupported frame header length");
  const flags = data.readUInt8(5);
  const frameId = data.readUInt32LE(8);
  const baseFrameId = data.readUInt32LE(12);
  const width = data.readUInt16LE(16);
  const height = data.readUInt16LE(18);
  const rectCount = data.readUInt16LE(20);
  const payloadLength = data.readUInt32LE(22);
  const expectedCrc = data.readUInt32LE(28);
  const body = data.subarray(FRAME_HEADER_LEN);
  if ((zlib.crc32(body) >>> 0) !== expectedCrc) throw new Error("frame CRC does not match");

  const rects: DecodedRect[] = [];
  let offset = 0;
  let totalPayload = 0;
  for (let index = 0; index < rectCount; index += 1) {
    if (offset + RECT_HEADER_LEN > body.length) throw new Error("rect header exceeds frame body");
    const x = body.readUInt16LE(offset);
    const y = body.readUInt16LE(offset + 2);
    const rectWidth = body.readUInt16LE(offset + 4);
    const rectHeight = body.readUInt16LE(offset + 6);
    const format = body.readUInt8(offset + 8);
    const encoding = body.readUInt8(offset + 9);
    const rectPayloadLength = body.readUInt32LE(offset + 12);
    offset += RECT_HEADER_LEN;
    if (format !== FORMAT_RGB565) throw new Error("only RGB565 rects are supported");
    if (offset + rectPayloadLength > body.length) throw new Error("rect payload exceeds frame body");
    const payload = body.subarray(offset, offset + rectPayloadLength);
    offset += rectPayloadLength;
    totalPayload += rectPayloadLength;
    if (encoding === ENCODING_RAW && rectPayloadLength !== rectWidth * rectHeight * 2) {
      throw new Error("rect payload length does not match geometry");
    }
    if (encoding === ENCODING_RGB565_RLE) decodeRgb565Rle(payload, rectWidth * rectHeight);
    else if (encoding !== ENCODING_RAW) throw new Error("unsupported RGB565 rect encoding");
    rects.push({x, y, width: rectWidth, height: rectHeight, payload, encoding});
  }
  if (offset !== body.length || totalPayload !== payloadLength) throw new Error("frame body length does not match header");
  return {frameId, baseFrameId, width, height, fullFrame: (flags & FLAG_FULL_FRAME) !== 0, rects};
}

export function applyFrameToRgba(canvas: Buffer<ArrayBufferLike>, canvasWidth: number, frame: DecodedFrame): Buffer<ArrayBufferLike> {
  let out = canvas;
  if (out.length !== frame.width * frame.height * 4 || frame.fullFrame) {
    out = Buffer.alloc(frame.width * frame.height * 4);
    for (let index = 3; index < out.length; index += 4) out[index] = 255;
  }
  for (const rect of frame.rects) {
    const payload = rect.encoding === ENCODING_RGB565_RLE ? decodeRgb565Rle(rect.payload, rect.width * rect.height) : rect.payload;
    const rgba = rgb565ToRgba(payload);
    for (let y = 0; y < rect.height; y += 1) {
      rgba.copy(out, ((rect.y + y) * canvasWidth + rect.x) * 4, y * rect.width * 4, (y + 1) * rect.width * 4);
    }
  }
  return out;
}

function rgb565ToRgba(data: Buffer): Buffer {
  if (data.length % 2 !== 0) throw new Error("RGB565 payload length must be even");
  const out = Buffer.alloc((data.length / 2) * 4);
  let outIndex = 0;
  for (let index = 0; index < data.length; index += 2) {
    const value = data[index] | (data[index + 1] << 8);
    out[outIndex] = (((value >> 11) & 0x1f) * 255) / 31;
    out[outIndex + 1] = (((value >> 5) & 0x3f) * 255) / 63;
    out[outIndex + 2] = ((value & 0x1f) * 255) / 31;
    out[outIndex + 3] = 255;
    outIndex += 4;
  }
  return out;
}

async function main(): Promise<void> {
  const args = new Map<string, string>();
  for (let index = 2; index < process.argv.length; index += 1) {
    const key = process.argv[index];
    if (key.startsWith("--")) args.set(key.slice(2), process.argv[index + 1] ?? ""), index += 1;
  }
  const baseUrl = args.get("base-url") ?? "http://127.0.0.1:18080";
  const deviceId = args.get("device-id") ?? "preview-01";
  const output = args.get("output") ?? "frame-preview.png";
  const frames = Number(args.get("frames") ?? "2");
  const waitMs = Number(args.get("wait-ms") ?? "1200");
  const inputEvent = args.get("input-event");
  const inputSeq = Number(args.get("input-seq") ?? "1");
  if (inputEvent) {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/v1/devices/${deviceId}/input`, {
      method: "POST",
      headers: {"content-type": "application/json"},
      body: JSON.stringify({
        seq: inputSeq,
        event: inputEvent,
        uptime_ms: Math.round(performance.now()),
      }),
    });
    if (!response.ok && response.status !== 204) {
      throw new Error(`input event failed with status ${response.status}`);
    }
  }
  let have = 0;
  let rgba: Buffer<ArrayBufferLike> = Buffer.alloc(0);
  let width = 240;
  let height = 240;
  for (let index = 0; index < frames; index += 1) {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/v1/devices/${deviceId}/frame?have=${have}&wait_ms=${waitMs}`);
    if (response.status === 204) continue;
    if (!response.ok) throw new Error(`frame request failed with status ${response.status}`);
    const frame = decodeFrame(Buffer.from(await response.arrayBuffer()));
    width = frame.width;
    height = frame.height;
    rgba = applyFrameToRgba(rgba, width, frame);
    have = frame.frameId;
    console.log(`${index + 1}: frame=${frame.frameId} ${frame.fullFrame ? "full" : "partial"} rects=${frame.rects.length}`);
  }
  if (!rgba.length) throw new Error("no frame was fetched");
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
  await mkdir(path.dirname(output), {recursive: true});
  await writeFile(output, canvas.encodeSync("png"));
  console.log(`saved ${output}`);
}

if (process.argv[1]?.endsWith("frame-preview.js")) {
  await main();
}
