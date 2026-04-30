from PIL import Image

from app.protocol import FrameRect, encode_frame, rgb888_to_rgb565_bytes
from tools.frame_preview import apply_frame_to_canvas, decode_frame


def test_frame_preview_decodes_and_applies_rgb565_rect():
    payload = rgb888_to_rgb565_bytes(bytes([255, 0, 0, 0, 255, 0]))
    frame = encode_frame(
        frame_id=7,
        base_frame_id=0,
        width=2,
        height=1,
        rects=[FrameRect(0, 0, 2, 1, payload)],
        full_frame=True,
    )

    decoded = decode_frame(frame)
    canvas = Image.new("RGB", (2, 1), (0, 0, 0))
    apply_frame_to_canvas(canvas, decoded)

    assert decoded.frame_id == 7
    assert decoded.full_frame is True
    assert canvas.getpixel((0, 0)) == (255, 0, 0)
    assert canvas.getpixel((1, 0)) == (0, 255, 0)
