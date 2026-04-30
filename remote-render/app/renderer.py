from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from zoneinfo import ZoneInfo

from PIL import Image, ImageDraw, ImageFont

from app.protocol import FrameRect, rgb888_to_rgb565_bytes

SCREEN_WIDTH = 240
SCREEN_HEIGHT = 240


@dataclass(frozen=True)
class RenderedFrame:
    frame_id: int
    base_frame_id: int
    full_frame: bool
    rects: list[FrameRect]


def render_device_view(
    *,
    device_id: str,
    button_count: int,
    frame_id: int = 1,
    now: datetime | None = None,
) -> RenderedFrame:
    current_time = now or datetime.now(ZoneInfo("Asia/Shanghai"))
    image = Image.new("RGB", (SCREEN_WIDTH, SCREEN_HEIGHT), (8, 10, 12))
    draw = ImageDraw.Draw(image)

    font_large = _load_font(52)
    font_medium = _load_font(20)
    font_small = _load_font(14)

    draw.rounded_rectangle((10, 10, 230, 230), radius=12, outline=(48, 64, 72), width=2)
    draw.text((20, 24), "SmallDesktopDisplay", fill=(130, 190, 180), font=font_small)

    time_text = current_time.strftime("%H:%M:%S")
    time_box = draw.textbbox((0, 0), time_text, font=font_large)
    time_width = time_box[2] - time_box[0]
    draw.text(
        ((SCREEN_WIDTH - time_width) // 2, 70),
        time_text,
        fill=(238, 245, 230),
        font=font_large,
    )

    date_text = current_time.strftime("%Y-%m-%d")
    date_box = draw.textbbox((0, 0), date_text, font=font_medium)
    date_width = date_box[2] - date_box[0]
    draw.text(
        ((SCREEN_WIDTH - date_width) // 2, 135),
        date_text,
        fill=(150, 168, 180),
        font=font_medium,
    )

    draw.rounded_rectangle((24, 172, 216, 210), radius=8, fill=(20, 27, 31))
    draw.text((36, 183), f"{device_id}  inputs:{button_count}", fill=(210, 225, 218), font=font_small)

    payload = rgb888_to_rgb565_bytes(image.tobytes())
    return RenderedFrame(
        frame_id=frame_id,
        base_frame_id=0,
        full_frame=True,
        rects=[FrameRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT, payload)],
    )


def _load_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",
    ]
    for path in candidates:
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default()
