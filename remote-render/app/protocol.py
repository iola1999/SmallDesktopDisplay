from __future__ import annotations

import struct
import zlib
from dataclasses import dataclass
from typing import Iterable

MAGIC = b"SDD1"
VERSION = 1
HEADER_LEN = 32
FORMAT_RGB565 = 1
ENCODING_RAW = 0
ENCODING_RGB565_RLE = 1
FLAG_FULL_FRAME = 0x01
FLAG_RESET_REQUIRED = 0x02


@dataclass(frozen=True)
class FrameRect:
    x: int
    y: int
    width: int
    height: int
    payload: bytes
    format: int = FORMAT_RGB565
    encoding: int = ENCODING_RAW


@dataclass(frozen=True)
class DecodedFrame:
    frame_id: int
    base_frame_id: int
    width: int
    height: int
    full_frame: bool
    reset_required: bool
    rects: list[FrameRect]


def rgb888_to_rgb565_bytes(rgb: bytes) -> bytes:
    if len(rgb) % 3 != 0:
        raise ValueError("RGB888 payload length must be divisible by 3")

    out = bytearray((len(rgb) // 3) * 2)
    out_index = 0
    for index in range(0, len(rgb), 3):
        red = rgb[index]
        green = rgb[index + 1]
        blue = rgb[index + 2]
        value = ((red & 0xF8) << 8) | ((green & 0xFC) << 3) | (blue >> 3)
        out[out_index] = value & 0xFF
        out[out_index + 1] = (value >> 8) & 0xFF
        out_index += 2
    return bytes(out)


def encode_rgb565_rle(rgb565: bytes) -> bytes:
    if len(rgb565) % 2 != 0:
        raise ValueError("RGB565 payload length must be even")
    if not rgb565:
        return b""

    out = bytearray()
    run_pixel = rgb565[0:2]
    run_len = 1
    for index in range(2, len(rgb565), 2):
        pixel = rgb565[index : index + 2]
        if pixel == run_pixel and run_len < 255:
            run_len += 1
            continue
        out.append(run_len)
        out += run_pixel
        run_pixel = pixel
        run_len = 1

    out.append(run_len)
    out += run_pixel
    return bytes(out)


def decode_rgb565_rle(payload: bytes, expected_pixels: int) -> bytes:
    if len(payload) % 3 != 0:
        raise ValueError("RGB565 RLE payload length must be divisible by 3")
    out = bytearray()
    for index in range(0, len(payload), 3):
        run_len = payload[index]
        if run_len == 0:
            raise ValueError("RGB565 RLE run length must be positive")
        out += payload[index + 1 : index + 3] * run_len
    if len(out) != expected_pixels * 2:
        raise ValueError("RGB565 RLE decoded length does not match geometry")
    return bytes(out)


def decode_frame(data: bytes) -> DecodedFrame:
    if len(data) < HEADER_LEN:
        raise ValueError("frame is shorter than the SDD1 header")

    (
        magic,
        version,
        flags,
        header_len,
        frame_id,
        base_frame_id,
        width,
        height,
        rect_count,
        payload_len,
        _reserved,
        expected_crc,
    ) = struct.unpack("<4sBBHIIHHHIHI", data[:HEADER_LEN])

    if magic != MAGIC:
        raise ValueError("frame magic is not SDD1")
    if version != VERSION:
        raise ValueError(f"unsupported frame version {version}")
    if header_len != HEADER_LEN:
        raise ValueError(f"unsupported frame header length {header_len}")

    body = data[header_len:]
    if zlib.crc32(body) & 0xFFFFFFFF != expected_crc:
        raise ValueError("frame CRC does not match")

    rects: list[FrameRect] = []
    offset = 0
    total_payload_len = 0
    for _ in range(rect_count):
        if offset + 16 > len(body):
            raise ValueError("rect header exceeds frame body")
        x, y, rect_width, rect_height, fmt, encoding, _rect_reserved, rect_payload_len = struct.unpack(
            "<HHHHBBHI",
            body[offset : offset + 16],
        )
        offset += 16
        if offset + rect_payload_len > len(body):
            raise ValueError("rect payload exceeds frame body")
        payload = body[offset : offset + rect_payload_len]
        offset += rect_payload_len
        total_payload_len += rect_payload_len
        rect = FrameRect(
            x=x,
            y=y,
            width=rect_width,
            height=rect_height,
            payload=payload,
            format=fmt,
            encoding=encoding,
        )
        _validate_rect(width, height, rect)
        rects.append(rect)

    if offset != len(body) or total_payload_len != payload_len:
        raise ValueError("frame body length does not match header")

    return DecodedFrame(
        frame_id=frame_id,
        base_frame_id=base_frame_id,
        width=width,
        height=height,
        full_frame=(flags & FLAG_FULL_FRAME) != 0,
        reset_required=(flags & FLAG_RESET_REQUIRED) != 0,
        rects=rects,
    )


def split_frame_for_websocket(data: bytes, max_message_bytes: int = 8192) -> list[bytes]:
    frame = decode_frame(data)
    if len(data) <= max_message_bytes:
        return [data]

    chunks: list[bytes] = []
    first_chunk = True
    for rect in frame.rects:
        for split_rect in _split_rect_for_websocket(rect, max_message_bytes=max_message_bytes):
            chunk = encode_frame(
                frame_id=frame.frame_id,
                base_frame_id=frame.base_frame_id,
                width=frame.width,
                height=frame.height,
                rects=[split_rect],
                full_frame=frame.full_frame and first_chunk,
                reset_required=frame.reset_required and first_chunk,
            )
            if len(chunk) > max_message_bytes and split_rect.height > 1:
                raise ValueError("websocket chunk exceeds max message size")
            chunks.append(chunk)
            first_chunk = False

    return chunks or [data]


def _split_rect_for_websocket(rect: FrameRect, *, max_message_bytes: int) -> list[FrameRect]:
    raw_payload = (
        decode_rgb565_rle(rect.payload, rect.width * rect.height)
        if rect.encoding == ENCODING_RGB565_RLE
        else rect.payload
    )
    max_body_bytes = max(2, max_message_bytes - HEADER_LEN - 16)
    max_rows = max(1, min(16, max_body_bytes // (rect.width * 2)))
    rows: list[FrameRect] = []
    for top in range(0, rect.height, max_rows):
        height = min(max_rows, rect.height - top)
        start = top * rect.width * 2
        end = (top + height) * rect.width * 2
        rows.append(
            compress_rect_if_smaller(
                FrameRect(
                    x=rect.x,
                    y=rect.y + top,
                    width=rect.width,
                    height=height,
                    payload=raw_payload[start:end],
                    format=rect.format,
                    encoding=ENCODING_RAW,
                )
            )
        )
    return rows


def compress_rect_if_smaller(rect: FrameRect) -> FrameRect:
    if rect.format != FORMAT_RGB565 or rect.encoding != ENCODING_RAW:
        return rect
    compressed = encode_rgb565_rle(rect.payload)
    if len(compressed) >= len(rect.payload):
        return rect
    return FrameRect(
        rect.x,
        rect.y,
        rect.width,
        rect.height,
        compressed,
        format=rect.format,
        encoding=ENCODING_RGB565_RLE,
    )


def encode_frame(
    *,
    frame_id: int,
    base_frame_id: int,
    width: int,
    height: int,
    rects: Iterable[FrameRect],
    full_frame: bool = False,
    reset_required: bool = False,
) -> bytes:
    rect_list = list(rects)
    body = bytearray()
    total_payload_len = 0

    for rect in rect_list:
        _validate_rect(width, height, rect)
        payload_len = len(rect.payload)
        total_payload_len += payload_len
        body += struct.pack(
            "<HHHHBBHI",
            rect.x,
            rect.y,
            rect.width,
            rect.height,
            rect.format,
            rect.encoding,
            0,
            payload_len,
        )
        body += rect.payload

    flags = 0
    if full_frame:
        flags |= FLAG_FULL_FRAME
    if reset_required:
        flags |= FLAG_RESET_REQUIRED

    crc32 = zlib.crc32(body) & 0xFFFFFFFF
    header = struct.pack(
        "<4sBBHIIHHHIHI",
        MAGIC,
        VERSION,
        flags,
        HEADER_LEN,
        frame_id,
        base_frame_id,
        width,
        height,
        len(rect_list),
        total_payload_len,
        0,
        crc32,
    )
    return header + bytes(body)


def _validate_rect(screen_width: int, screen_height: int, rect: FrameRect) -> None:
    if rect.width <= 0 or rect.height <= 0:
        raise ValueError("rect dimensions must be positive")
    if rect.x < 0 or rect.y < 0:
        raise ValueError("rect coordinates must be non-negative")
    if rect.x + rect.width > screen_width or rect.y + rect.height > screen_height:
        raise ValueError("rect exceeds screen bounds")
    if rect.format != FORMAT_RGB565:
        raise ValueError("only RGB565 rects are supported")

    expected_len = rect.width * rect.height * 2
    if rect.encoding == ENCODING_RAW and len(rect.payload) != expected_len:
        raise ValueError(
            f"payload length {len(rect.payload)} does not match {expected_len}"
        )
    if rect.encoding == ENCODING_RGB565_RLE:
        decode_rgb565_rle(rect.payload, rect.width * rect.height)
    elif rect.encoding != ENCODING_RAW:
        raise ValueError("unsupported rect encoding")
