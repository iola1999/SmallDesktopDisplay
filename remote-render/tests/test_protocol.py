import struct
import zlib

import pytest

from app.protocol import (
    ENCODING_RGB565_RLE,
    FORMAT_RGB565,
    MAGIC,
    FrameRect,
    encode_frame,
    encode_rgb565_rle,
    rgb888_to_rgb565_bytes,
)


def test_encode_full_frame_uses_sdd1_header_and_crc():
    pixels = bytes([0x00, 0xF8]) * 4
    frame = encode_frame(
        frame_id=7,
        base_frame_id=0,
        width=2,
        height=2,
        rects=[FrameRect(0, 0, 2, 2, pixels)],
        full_frame=True,
    )

    header = struct.unpack("<4sBBHIIHHHIHI", frame[:32])

    assert header[0] == MAGIC
    assert header[1] == 1
    assert header[2] == 0x01
    assert header[3] == 32
    assert header[4] == 7
    assert header[5] == 0
    assert header[6] == 2
    assert header[7] == 2
    assert header[8] == 1
    assert header[9] == len(pixels)

    assert header[10] == 0
    crc = header[11]
    body = frame[32:]
    assert zlib.crc32(body) & 0xFFFFFFFF == crc

    rect_header = struct.unpack("<HHHHBBHI", body[:16])
    assert rect_header == (0, 0, 2, 2, FORMAT_RGB565, 0, 0, len(pixels))
    assert body[16:] == pixels


def test_encode_frame_rejects_payload_size_mismatch():
    with pytest.raises(ValueError, match="payload length"):
        encode_frame(
            frame_id=1,
            base_frame_id=0,
            width=2,
            height=2,
            rects=[FrameRect(0, 0, 2, 2, b"\x00")],
            full_frame=True,
        )


def test_rgb888_to_rgb565_bytes_converts_pixels_little_endian():
    rgb = bytes(
        [
            255,
            0,
            0,
            0,
            255,
            0,
            0,
            0,
            255,
        ]
    )

    assert rgb888_to_rgb565_bytes(rgb) == bytes(
        [
            0x00,
            0xF8,
            0xE0,
            0x07,
            0x1F,
            0x00,
        ]
    )


def test_rgb565_rle_encodes_repeated_pixel_runs():
    red = bytes([0x00, 0xF8])
    green = bytes([0xE0, 0x07])

    assert encode_rgb565_rle(red * 3 + green * 2) == bytes(
        [
            3,
            0x00,
            0xF8,
            2,
            0xE0,
            0x07,
        ]
    )


def test_encode_frame_accepts_rgb565_rle_payload():
    payload = bytes([4, 0x00, 0xF8])
    frame = encode_frame(
        frame_id=8,
        base_frame_id=0,
        width=2,
        height=2,
        rects=[FrameRect(0, 0, 2, 2, payload, encoding=ENCODING_RGB565_RLE)],
        full_frame=True,
    )

    rect_header = struct.unpack("<HHHHBBHI", frame[32:48])
    assert rect_header == (0, 0, 2, 2, FORMAT_RGB565, ENCODING_RGB565_RLE, 0, len(payload))
