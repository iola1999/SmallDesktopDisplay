from __future__ import annotations

import argparse
import json
import struct
import time
import urllib.error
import urllib.request
import zlib
from dataclasses import dataclass
from pathlib import Path

from PIL import Image

from app.protocol import decode_rgb565_rle

MAGIC = b"SDD1"
FRAME_HEADER = struct.Struct("<4sBBHIIHHHIHI")
RECT_HEADER = struct.Struct("<HHHHBBHI")
FLAG_FULL_FRAME = 0x01
FORMAT_RGB565 = 1
ENCODING_RAW = 0
ENCODING_RGB565_RLE = 1


@dataclass(frozen=True)
class DecodedRect:
    x: int
    y: int
    width: int
    height: int
    payload: bytes
    encoding: int = ENCODING_RAW


@dataclass(frozen=True)
class DecodedFrame:
    frame_id: int
    base_frame_id: int
    width: int
    height: int
    full_frame: bool
    rects: list[DecodedRect]


def decode_frame(data: bytes) -> DecodedFrame:
    if len(data) < FRAME_HEADER.size:
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
    ) = FRAME_HEADER.unpack(data[: FRAME_HEADER.size])

    if magic != MAGIC:
        raise ValueError("frame magic is not SDD1")
    if version != 1:
        raise ValueError(f"unsupported frame version {version}")
    if header_len != FRAME_HEADER.size:
        raise ValueError(f"unsupported frame header length {header_len}")

    body = data[header_len:]
    if zlib.crc32(body) & 0xFFFFFFFF != expected_crc:
        raise ValueError("frame CRC does not match")

    rects: list[DecodedRect] = []
    offset = 0
    total_payload = 0
    for _ in range(rect_count):
        if offset + RECT_HEADER.size > len(body):
            raise ValueError("rect header exceeds frame body")
        x, y, rect_width, rect_height, fmt, encoding, _rect_reserved, rect_payload_len = (
            RECT_HEADER.unpack(body[offset : offset + RECT_HEADER.size])
        )
        offset += RECT_HEADER.size

        if fmt != FORMAT_RGB565:
            raise ValueError("only RGB565 rects are supported")
        if offset + rect_payload_len > len(body):
            raise ValueError("rect payload exceeds frame body")
        payload = body[offset : offset + rect_payload_len]
        offset += rect_payload_len
        total_payload += rect_payload_len
        if encoding == ENCODING_RAW and rect_payload_len != rect_width * rect_height * 2:
            raise ValueError("rect payload length does not match geometry")
        if encoding == ENCODING_RGB565_RLE:
            decode_rgb565_rle(payload, rect_width * rect_height)
        elif encoding != ENCODING_RAW:
            raise ValueError("unsupported RGB565 rect encoding")
        rects.append(DecodedRect(x, y, rect_width, rect_height, payload, encoding))

    if offset != len(body) or total_payload != payload_len:
        raise ValueError("frame body length does not match header")

    return DecodedFrame(
        frame_id=frame_id,
        base_frame_id=base_frame_id,
        width=width,
        height=height,
        full_frame=(flags & FLAG_FULL_FRAME) != 0,
        rects=rects,
    )


def apply_frame_to_canvas(canvas: Image.Image, frame: DecodedFrame) -> None:
    if canvas.size != (frame.width, frame.height):
        raise ValueError("canvas size does not match frame size")

    if frame.full_frame:
        canvas.paste((0, 0, 0), (0, 0, frame.width, frame.height))

    for rect in frame.rects:
        payload = (
            decode_rgb565_rle(rect.payload, rect.width * rect.height)
            if rect.encoding == ENCODING_RGB565_RLE
            else rect.payload
        )
        rect_image = Image.frombytes(
            "RGB",
            (rect.width, rect.height),
            _rgb565_to_rgb888(payload),
        )
        canvas.paste(rect_image, (rect.x, rect.y))


def fetch_frame(base_url: str, device_id: str, have: int, wait_ms: int) -> bytes | None:
    url = (
        base_url.rstrip("/")
        + f"/api/v1/devices/{device_id}/frame?have={have}&wait_ms={wait_ms}"
    )
    request = urllib.request.Request(url)
    try:
        with urllib.request.urlopen(request, timeout=max(2.0, wait_ms / 1000.0 + 2.0)) as response:
            if response.status == 204:
                return None
            return response.read()
    except urllib.error.HTTPError as error:
        if error.code == 204:
            return None
        raise


def post_input(base_url: str, device_id: str, event: str, seq: int) -> None:
    url = base_url.rstrip("/") + f"/api/v1/devices/{device_id}/input"
    payload = json.dumps(
        {
            "seq": seq,
            "event": event,
            "uptime_ms": int(time.monotonic() * 1000),
        }
    ).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=2.0) as response:
        if response.status not in {200, 202, 204}:
            raise RuntimeError(f"input event failed with status {response.status}")


def preview_frames(
    *,
    base_url: str,
    device_id: str,
    output: Path,
    frames: int,
    wait_ms: int,
) -> None:
    canvas: Image.Image | None = None
    have = 0

    for index in range(frames):
        data = fetch_frame(base_url, device_id, have, wait_ms)
        if data is None:
            print(f"{index + 1}: 204 no content")
            time.sleep(max(wait_ms, 100) / 1000.0)
            continue

        frame = decode_frame(data)
        if canvas is None or frame.full_frame:
            canvas = Image.new("RGB", (frame.width, frame.height), (0, 0, 0))
        apply_frame_to_canvas(canvas, frame)
        have = frame.frame_id
        rect_summary = ", ".join(
            f"{rect.x},{rect.y},{rect.width}x{rect.height}" for rect in frame.rects
        )
        print(
            f"{index + 1}: frame={frame.frame_id} "
            f"{'full' if frame.full_frame else 'partial'} bytes={len(data)} rects=[{rect_summary}]"
        )

    if canvas is None:
        raise RuntimeError("no frame was fetched")

    output.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(output)
    print(f"saved {output}")


def _rgb565_to_rgb888(data: bytes) -> bytes:
    if len(data) % 2 != 0:
        raise ValueError("RGB565 payload length must be even")

    out = bytearray((len(data) // 2) * 3)
    out_index = 0
    for index in range(0, len(data), 2):
        value = data[index] | (data[index + 1] << 8)
        red = ((value >> 11) & 0x1F) * 255 // 31
        green = ((value >> 5) & 0x3F) * 255 // 63
        blue = (value & 0x1F) * 255 // 31
        out[out_index] = red
        out[out_index + 1] = green
        out[out_index + 2] = blue
        out_index += 3
    return bytes(out)


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch SDD1 frames and render a PNG preview.")
    parser.add_argument("--base-url", default="http://127.0.0.1:18080")
    parser.add_argument("--device-id", default="preview-01")
    parser.add_argument("--output", type=Path, default=Path("frame-preview.png"))
    parser.add_argument("--frames", type=int, default=2)
    parser.add_argument("--wait-ms", type=int, default=1200)
    parser.add_argument("--input-event", choices=["short_press", "double_press", "long_press"])
    parser.add_argument("--input-seq", type=int, default=1)
    args = parser.parse_args()

    if args.input_event:
        post_input(args.base_url, args.device_id, args.input_event, args.input_seq)

    preview_frames(
        base_url=args.base_url,
        device_id=args.device_id,
        output=args.output,
        frames=args.frames,
        wait_ms=args.wait_ms,
    )


if __name__ == "__main__":
    main()
