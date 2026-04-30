from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from zoneinfo import ZoneInfo

from PIL import Image, ImageChops, ImageDraw, ImageFont

from app.protocol import FrameRect, rgb888_to_rgb565_bytes

SCREEN_WIDTH = 240
SCREEN_HEIGHT = 240
TIME_REGION = (0, 42, SCREEN_WIDTH, 142)
FOOTER_REGION = (14, 166, 226, 218)


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
    base_frame_id: int = 0,
    full_frame: bool = True,
    regions: list[tuple[int, int, int, int]] | None = None,
    now: datetime | None = None,
) -> RenderedFrame:
    current_time = now or datetime.now(ZoneInfo("Asia/Shanghai"))
    image = render_device_canvas(
        current_time=current_time,
        device_id=device_id,
        button_count=button_count,
    )
    return render_canvas_frame(
        image,
        frame_id=frame_id,
        base_frame_id=base_frame_id,
        full_frame=full_frame,
        regions=regions,
    )


def render_canvas_frame(
    image: Image.Image,
    *,
    frame_id: int,
    base_frame_id: int = 0,
    full_frame: bool = True,
    regions: list[tuple[int, int, int, int]] | None = None,
) -> RenderedFrame:
    if full_frame:
        payload = rgb888_to_rgb565_bytes(image.tobytes())
        rects = [FrameRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT, payload)]
    else:
        rects = [_crop_rect(image, region) for region in (regions or [TIME_REGION])]

    return RenderedFrame(
        frame_id=frame_id,
        base_frame_id=base_frame_id,
        full_frame=full_frame,
        rects=rects,
    )


def render_device_canvas(*, current_time: datetime, device_id: str, button_count: int) -> Image.Image:
    image = Image.new("RGB", (SCREEN_WIDTH, SCREEN_HEIGHT), (5, 8, 10))
    draw = ImageDraw.Draw(image)

    font_time = _load_font(52)
    font_date = _load_font(20)
    font_label = _load_font(16)
    font_footer = _load_font(18)

    draw.rounded_rectangle((8, 8, 232, 232), radius=14, outline=(48, 64, 72), width=2)
    draw.text((20, 20), "Remote Display", fill=(130, 190, 180), font=font_label)

    time_text = current_time.strftime("%H:%M:%S")
    time_box = draw.textbbox((0, 0), time_text, font=font_time)
    time_width = time_box[2] - time_box[0]
    draw.text(
        ((SCREEN_WIDTH - time_width) // 2, 58),
        time_text,
        fill=(238, 245, 230),
        font=font_time,
    )

    date_text = current_time.strftime("%m-%d %a")
    date_box = draw.textbbox((0, 0), date_text, font=font_date)
    date_width = date_box[2] - date_box[0]
    draw.text(
        ((SCREEN_WIDTH - date_width) // 2, 126),
        date_text.upper(),
        fill=(170, 188, 198),
        font=font_date,
    )

    draw.rounded_rectangle((16, 168, 224, 216), radius=10, fill=(20, 28, 32))
    draw.text((30, 182), device_id[:14], fill=(210, 225, 218), font=font_footer)
    draw.text((156, 182), f"tap {button_count}", fill=(132, 206, 186), font=font_footer)

    return image


def compute_dirty_rects(
    previous: Image.Image,
    current: Image.Image,
    *,
    regions: list[tuple[int, int, int, int]] | None = None,
    padding: int = 2,
) -> list[FrameRect]:
    if previous.size != current.size:
        raise ValueError("diff images must have the same size")

    dirty_regions = regions or [(0, 0, current.size[0], current.size[1])]
    rects: list[FrameRect] = []
    for region in dirty_regions:
        left, top, right, bottom = region
        previous_crop = previous.crop(region)
        current_crop = current.crop(region)
        diff_box = ImageChops.difference(previous_crop, current_crop).getbbox()
        if diff_box is None:
            continue

        dirty_left = max(left + diff_box[0] - padding, 0)
        dirty_top = max(top + diff_box[1] - padding, 0)
        dirty_right = min(left + diff_box[2] + padding, current.size[0])
        dirty_bottom = min(top + diff_box[3] + padding, current.size[1])
        rects.append(_crop_rect(current, (dirty_left, dirty_top, dirty_right, dirty_bottom)))

    return rects


def _crop_rect(image: Image.Image, region: tuple[int, int, int, int]) -> FrameRect:
    left, top, right, bottom = region
    cropped = image.crop(region)
    return FrameRect(
        left,
        top,
        right - left,
        bottom - top,
        rgb888_to_rgb565_bytes(cropped.tobytes()),
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
