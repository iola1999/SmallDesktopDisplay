from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from zoneinfo import ZoneInfo

from PIL import Image, ImageChops, ImageDraw, ImageFont

from app.protocol import FrameRect, rgb888_to_rgb565_bytes
from app.ui_state import (
    SETTINGS_ITEMS,
    DeviceUiState,
)

SCREEN_WIDTH = 240
SCREEN_HEIGHT = 240
TIME_REGION = (0, 42, SCREEN_WIDTH, 142)
FOOTER_REGION = (14, 166, 226, 218)
DIRTY_TILE_WIDTH = 24
DIRTY_TILE_HEIGHT = 8


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
    ui_state: DeviceUiState | None = None,
    animation_progress: float = 1.0,
) -> RenderedFrame:
    current_time = now or datetime.now(ZoneInfo("Asia/Shanghai"))
    image = render_device_canvas(
        current_time=current_time,
        device_id=device_id,
        button_count=button_count,
        ui_state=ui_state,
        animation_progress=animation_progress,
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


def render_device_canvas(
    *,
    current_time: datetime,
    device_id: str,
    button_count: int,
    ui_state: DeviceUiState | None = None,
    animation_progress: float = 1.0,
) -> Image.Image:
    font_time = _load_font(52)
    font_date = _load_font(20)
    font_label = _load_font(16)
    font_footer = _load_font(18)

    state = ui_state or DeviceUiState()
    image = Image.new("RGB", (SCREEN_WIDTH, SCREEN_HEIGHT), (5, 8, 10))
    if state.page == "settings":
        page = _render_settings_page(state)
    elif state.page == "detail":
        page = _render_detail_page(state)
    else:
        page = _render_home_page(
            current_time=current_time,
            device_id=device_id,
            button_count=button_count,
            font_time=font_time,
            font_date=font_date,
            font_label=font_label,
            font_footer=font_footer,
        )

    _paste_animated_page(image, page, state, animation_progress)
    return image


def _render_home_page(
    *,
    current_time: datetime,
    device_id: str,
    button_count: int,
    font_time: ImageFont.FreeTypeFont | ImageFont.ImageFont,
    font_date: ImageFont.FreeTypeFont | ImageFont.ImageFont,
    font_label: ImageFont.FreeTypeFont | ImageFont.ImageFont,
    font_footer: ImageFont.FreeTypeFont | ImageFont.ImageFont,
) -> Image.Image:
    image = Image.new("RGB", (SCREEN_WIDTH, SCREEN_HEIGHT), (5, 8, 10))
    draw = ImageDraw.Draw(image)

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


def _render_settings_page(state: DeviceUiState) -> Image.Image:
    image = Image.new("RGB", (SCREEN_WIDTH, SCREEN_HEIGHT), (6, 9, 13))
    draw = ImageDraw.Draw(image)
    font_title = _load_font(24)
    font_item = _load_font(17)
    font_small = _load_font(13)

    draw.rounded_rectangle((8, 8, 232, 232), radius=14, outline=(46, 58, 70), width=2)
    draw.text((20, 18), "Settings", fill=(235, 242, 232), font=font_title)
    draw.text((166, 25), "remote", fill=(96, 158, 174), font=font_small)

    top = 58
    row_h = 30
    for index, item in enumerate(SETTINGS_ITEMS):
        y = top + index * 33
        selected = index == state.selected_index
        if selected:
            draw.rounded_rectangle((16, y - 2, 224, y + row_h), radius=10, fill=(27, 98, 101))
            draw.rounded_rectangle((19, y + 1, 43, y + row_h - 3), radius=8, fill=(114, 224, 198))
            text_fill = (244, 252, 244)
            index_fill = (10, 42, 44)
        else:
            draw.rounded_rectangle((16, y - 2, 224, y + row_h), radius=10, fill=(17, 24, 30))
            text_fill = (165, 183, 190)
            index_fill = (88, 112, 120)

        number = f"{index + 1}"
        number_width = _text_width(draw, number, font_small)
        draw.text((31 - number_width // 2, y + 6), number, fill=index_fill, font=font_small)
        draw.text((54, y + 4), item, fill=text_fill, font=font_item)
        if item == "Brightness":
            value = f"{state.brightness}%"
            draw.text((186, y + 6), value, fill=text_fill, font=font_small)

    return image


def _render_detail_page(state: DeviceUiState) -> Image.Image:
    if state.detail_index == 0:
        return _render_brightness_detail_page(state)

    image = Image.new("RGB", (SCREEN_WIDTH, SCREEN_HEIGHT), (5, 8, 10))
    draw = ImageDraw.Draw(image)
    font_title = _load_font(22)
    font_body = _load_font(18)
    font_small = _load_font(13)

    item = SETTINGS_ITEMS[state.detail_index % len(SETTINGS_ITEMS)]
    draw.rounded_rectangle((8, 8, 232, 232), radius=14, outline=(50, 62, 72), width=2)
    draw.text((20, 18), item, fill=(238, 246, 236), font=font_title)
    draw.text((20, 49), "Setting detail", fill=(100, 155, 170), font=font_small)

    draw.rounded_rectangle((18, 82, 222, 178), radius=12, fill=(18, 29, 34))
    draw.text((34, 103), "Preview only", fill=(230, 238, 232), font=font_body)
    draw.text((34, 132), "More controls next", fill=(137, 166, 172), font=font_small)

    draw.rounded_rectangle((48, 196, 192, 216), radius=10, fill=(27, 98, 101))
    hint = "double tap back"
    draw.text(
        ((SCREEN_WIDTH - _text_width(draw, hint, font_small)) // 2, 199),
        hint,
        fill=(214, 248, 236),
        font=font_small,
    )
    return image


def _render_brightness_detail_page(state: DeviceUiState) -> Image.Image:
    image = Image.new("RGB", (SCREEN_WIDTH, SCREEN_HEIGHT), (5, 8, 10))
    draw = ImageDraw.Draw(image)
    font_title = _load_font(22)
    font_value = _load_font(42)
    font_body = _load_font(16)
    font_small = _load_font(13)

    value = max(0, min(100, state.pending_brightness))
    fill_width = int(170 * value / 100)

    draw.rounded_rectangle((8, 8, 232, 232), radius=14, outline=(50, 62, 72), width=2)
    draw.text((20, 18), "Brightness", fill=(238, 246, 236), font=font_title)
    draw.text((20, 49), "short cycle  hold apply", fill=(100, 155, 170), font=font_small)

    value_text = f"{value}%"
    value_width = _text_width(draw, value_text, font_value)
    draw.text(((SCREEN_WIDTH - value_width) // 2, 82), value_text, fill=(240, 248, 238), font=font_value)

    draw.rounded_rectangle((34, 146, 206, 164), radius=9, fill=(17, 27, 32))
    if fill_width > 0:
        draw.rounded_rectangle((35, 147, 35 + fill_width, 163), radius=8, fill=(112, 224, 196))
    draw.ellipse((30, 141, 48, 169), fill=(34, 44, 50), outline=(93, 118, 124), width=1)
    knob_x = 35 + fill_width
    draw.ellipse((knob_x - 8, 140, knob_x + 8, 170), fill=(220, 248, 236), outline=(77, 155, 145), width=2)

    status = "applied" if state.brightness == state.pending_brightness else f"saved {state.brightness}%"
    draw.text((34, 184), status, fill=(142, 178, 180), font=font_body)

    hint = "double tap back"
    draw.text(
        ((SCREEN_WIDTH - _text_width(draw, hint, font_small)) // 2, 210),
        hint,
        fill=(160, 190, 194),
        font=font_small,
    )
    return image


def _paste_animated_page(
    target: Image.Image,
    page: Image.Image,
    state: DeviceUiState,
    progress: float,
) -> None:
    target.paste(page, (0, 0))


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
        rects.extend(_tile_dirty_rects(previous, current, region, padding=padding))

    return rects


def _tile_dirty_rects(
    previous: Image.Image,
    current: Image.Image,
    region: tuple[int, int, int, int],
    *,
    padding: int,
) -> list[FrameRect]:
    left, top, right, bottom = region
    row_rects: list[tuple[int, int, int, int]] = []
    for y in range(top, bottom, DIRTY_TILE_HEIGHT):
        tile_bottom = min(y + DIRTY_TILE_HEIGHT, bottom)
        run_left: int | None = None
        run_right = left
        for x in range(left, right, DIRTY_TILE_WIDTH):
            tile_right = min(x + DIRTY_TILE_WIDTH, right)
            tile = (x, y, tile_right, tile_bottom)
            if ImageChops.difference(previous.crop(tile), current.crop(tile)).getbbox() is None:
                if run_left is not None:
                    row_rects.append(_padded_region(run_left, y, run_right, tile_bottom, current.size, 0))
                    run_left = None
                continue

            if run_left is None:
                run_left = x
            run_right = tile_right

        if run_left is not None:
            row_rects.append(_padded_region(run_left, y, run_right, tile_bottom, current.size, 0))

    return [_crop_rect(current, rect) for rect in _interleave_rect_rows(row_rects)]


def _padded_region(
    left: int,
    top: int,
    right: int,
    bottom: int,
    image_size: tuple[int, int],
    padding: int,
) -> tuple[int, int, int, int]:
    return (
        max(left - padding, 0),
        max(top - padding, 0),
        min(right + padding, image_size[0]),
        min(bottom + padding, image_size[1]),
    )


def _interleave_rect_rows(rects: list[tuple[int, int, int, int]]) -> list[tuple[int, int, int, int]]:
    if len(rects) <= 2:
        return rects
    return rects[0::4] + rects[1::4] + rects[2::4] + rects[3::4]


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


def _text_width(
    draw: ImageDraw.ImageDraw,
    text: str,
    font: ImageFont.FreeTypeFont | ImageFont.ImageFont,
) -> int:
    box = draw.textbbox((0, 0), text, font=font)
    return box[2] - box[0]
