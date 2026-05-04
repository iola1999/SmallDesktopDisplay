import {describe, expect, test} from "vitest";

import {
  ENCODING_RGB565_RLE,
  FORMAT_RGB565,
  MAGIC,
  FrameRect,
  decodeRgb565Rle,
  encodeFrame,
  encodeRgb565Rle,
  rgb888ToRgb565,
} from "./protocol.js";

describe("SDD1 protocol", () => {
  test("encodes a full frame header and CRC compatible with the ESP client", () => {
    const pixels = Buffer.alloc(8);
    for (let offset = 0; offset < pixels.length; offset += 2) {
      pixels[offset] = 0x00;
      pixels[offset + 1] = 0xf8;
    }

    const frame = encodeFrame({
      frameId: 7,
      baseFrameId: 0,
      width: 2,
      height: 2,
      rects: [new FrameRect(0, 0, 2, 2, pixels)],
      fullFrame: true,
    });

    expect(frame.subarray(0, 4).toString("ascii")).toBe(MAGIC);
    expect(frame.readUInt8(4)).toBe(1);
    expect(frame.readUInt8(5)).toBe(0x01);
    expect(frame.readUInt16LE(6)).toBe(32);
    expect(frame.readUInt32LE(8)).toBe(7);
    expect(frame.readUInt32LE(12)).toBe(0);
    expect(frame.readUInt16LE(16)).toBe(2);
    expect(frame.readUInt16LE(18)).toBe(2);
    expect(frame.readUInt16LE(20)).toBe(1);
    expect(frame.readUInt32LE(22)).toBe(pixels.length);
    expect(frame.readUInt16LE(26)).toBe(0);

    const body = frame.subarray(32);
    expect(frame.readUInt16LE(32)).toBe(0);
    expect(frame.readUInt16LE(34)).toBe(0);
    expect(frame.readUInt16LE(36)).toBe(2);
    expect(frame.readUInt16LE(38)).toBe(2);
    expect(frame.readUInt8(40)).toBe(FORMAT_RGB565);
    expect(frame.readUInt8(41)).toBe(0);
    expect(body.subarray(16)).toEqual(pixels);
  });

  test("converts RGB888 pixels to little-endian RGB565", () => {
    expect(
      rgb888ToRgb565(Buffer.from([255, 0, 0, 0, 255, 0, 0, 0, 255])),
    ).toEqual(Buffer.from([0x00, 0xf8, 0xe0, 0x07, 0x1f, 0x00]));
  });

  test("encodes and decodes repeated RGB565 runs", () => {
    const payload = encodeRgb565Rle(
      Buffer.from([0x00, 0xf8, 0x00, 0xf8, 0x00, 0xf8, 0xe0, 0x07]),
    );

    expect(payload).toEqual(Buffer.from([3, 0x00, 0xf8, 1, 0xe0, 0x07]));
    expect(decodeRgb565Rle(payload, 4)).toEqual(
      Buffer.from([0x00, 0xf8, 0x00, 0xf8, 0x00, 0xf8, 0xe0, 0x07]),
    );
  });

  test("accepts RLE rect payloads", () => {
    const payload = Buffer.from([4, 0x00, 0xf8]);
    const frame = encodeFrame({
      frameId: 8,
      baseFrameId: 0,
      width: 2,
      height: 2,
      rects: [new FrameRect(0, 0, 2, 2, payload, ENCODING_RGB565_RLE)],
      fullFrame: true,
    });

    expect(frame.readUInt8(41)).toBe(ENCODING_RGB565_RLE);
    expect(frame.readUInt32LE(44)).toBe(payload.length);
  });

  test("rejects raw payloads that do not match rect geometry", () => {
    expect(() =>
      encodeFrame({
        frameId: 1,
        baseFrameId: 0,
        width: 2,
        height: 2,
        rects: [new FrameRect(0, 0, 2, 2, Buffer.from([0]))],
        fullFrame: true,
      }),
    ).toThrow(/payload length/);
  });
});
