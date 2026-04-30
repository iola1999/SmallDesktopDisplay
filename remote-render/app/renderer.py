from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from zoneinfo import ZoneInfo

from PIL import Image, ImageChops, ImageDraw, ImageFont

from app.protocol import FrameRect, compress_rect_if_smaller, rgb888_to_rgb565_bytes
from app.ui_state import (
    SETTINGS_ITEMS,
    DeviceUiState,
    ease_out_cubic,
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
        rects = [compress_rect_if_smaller(FrameRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT, payload))]
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
        page = _render_settings_page(state, animation_progress=animation_progress)
    elif state.page == "detail":
        page = _render_detail_page(state, device_id=device_id, animation_progress=animation_progress)
    else:
        page = _render_home_page(
            current_time=current_time,
            device_id=device_id,
            button_count=button_count,
            state=state,
            animation_progress=animation_progress,
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
    state: DeviceUiState,
    animation_progress: float,
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

    tap_pulse = _pulse(animation_progress) if state.animation == "home_tap" else 0.0
    draw.rounded_rectangle((16, 168, 224, 216), radius=10, fill=_mix_color((20, 28, 32), (26, 54, 52), tap_pulse))
    if tap_pulse > 0:
        draw.rounded_rectangle((14, 166, 226, 218), radius=12, outline=_mix_color((30, 68, 64), (116, 230, 205), tap_pulse), width=1)
    draw.text((30, 182), device_id[:14], fill=(210, 225, 218), font=font_footer)
    draw.text((156, 182), f"tap {button_count}", fill=(132, 206, 186), font=font_footer)

    return image


def _render_settings_page(state: DeviceUiState, *, animation_progress: float) -> Image.Image:
    image = Image.new("RGB", (SCREEN_WIDTH, SCREEN_HEIGHT), (6, 9, 13))
    draw = ImageDraw.Draw(image)
    font_title = _load_font(24)
    font_item = _load_font(17)
    font_small = _load_font(13)
    select_pulse = _pulse(animation_progress) if state.animation == "settings_select" else 0.0

    draw.rounded_rectangle((8, 8, 232, 232), radius=14, outline=(46, 58, 70), width=2)
    draw.text((20, 18), "Settings", fill=(235, 242, 232), font=font_title)
    draw.text((166, 25), "remote", fill=_mix_color((96, 158, 174), (118, 220, 204), select_pulse * 0.45), font=font_small)

    top = 58
    row_h = 30
    for index, item in enumerate(SETTINGS_ITEMS):
        y = top + index * 33
        selected = index == state.selected_index
        if selected:
            row_shift = int(round((1.0 - ease_out_cubic(animation_progress)) * 4)) if state.animation == "settings_select" else 0
            glow = select_pulse * 0.6
            row_fill = _mix_color((27, 98, 101), (36, 139, 133), glow)
            chip_fill = _mix_color((114, 224, 198), (178, 255, 228), glow)
            draw.rounded_rectangle((16, y - 2 + row_shift, 224, y + row_h + row_shift), radius=10, fill=row_fill)
            if select_pulse > 0:
                draw.rounded_rectangle((14, y - 4 + row_shift, 226, y + row_h + 2 + row_shift), radius=12, outline=_mix_color((27, 98, 101), (124, 232, 211), glow), width=1)
            draw.rounded_rectangle((19, y + 1 + row_shift, 43, y + row_h - 3 + row_shift), radius=8, fill=chip_fill)
            text_fill = (244, 252, 244)
            index_fill = (10, 42, 44)
        else:
            row_shift = 0
            draw.rounded_rectangle((16, y - 2, 224, y + row_h), radius=10, fill=(17, 24, 30))
            text_fill = (165, 183, 190)
            index_fill = (88, 112, 120)

        number = f"{index + 1}"
        number_width = _text_width(draw, number, font_small)
        draw.text((31 - number_width // 2, y + 6 + row_shift), number, fill=index_fill, font=font_small)
        draw.text((54, y + 4 + row_shift), item, fill=text_fill, font=font_item)
        if item == "Brightness":
            value = f"{state.brightness}%"
            draw.text((186, y + 6 + row_shift), value, fill=text_fill, font=font_small)
        elif item == "Device" and state.diagnostics.heap_free > 0:
            value = _format_kb(state.diagnostics.heap_free)
            draw.text((178, y + 6 + row_shift), value, fill=text_fill, font=font_small)
        elif item == "Renderer":
            draw.text((177, y + 6 + row_shift), "HTTP", fill=text_fill, font=font_small)

    return image


def _render_detail_page(state: DeviceUiState, *, device_id: str, animation_progress: float) -> Image.Image:
    if state.detail_index == 0:
        return _render_brightness_detail_page(state, animation_progress=animation_progress)
    if SETTINGS_ITEMS[state.detail_index % len(SETTINGS_ITEMS)] == "Device":
        return _render_device_detail_page(state, animation_progress=animation_progress)
    if SETTINGS_ITEMS[state.detail_index % len(SETTINGS_ITEMS)] == "Renderer":
        return _render_renderer_detail_page(animation_progress=animation_progress)
    if SETTINGS_ITEMS[state.detail_index % len(SETTINGS_ITEMS)] == "About":
        return _render_about_detail_page(device_id=device_id, animation_progress=animation_progress)

    image = Image.new("RGB", (SCREEN_WIDTH, SCREEN_HEIGHT), (5, 8, 10))
    draw = ImageDraw.Draw(image)
    font_title = _load_font(22)
    font_body = _load_font(18)
    font_small = _load_font(13)

    item = SETTINGS_ITEMS[state.detail_index % len(SETTINGS_ITEMS)]
    draw.rounded_rectangle((8, 8, 232, 232), radius=14, outline=(50, 62, 72), width=2)
    draw.text((20, 18), item, fill=(238, 246, 236), font=font_title)
    draw.text((20, 49), "Setting detail", fill=(100, 155, 170), font=font_small)

    pulse = _pulse(animation_progress) if state.animation == "detail_pulse" else 0.0
    draw.rounded_rectangle((18, 82, 222, 178), radius=12, fill=_mix_color((18, 29, 34), (23, 43, 48), pulse))
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


def _render_device_detail_page(state: DeviceUiState, *, animation_progress: float) -> Image.Image:
    image = Image.new("RGB", (SCREEN_WIDTH, SCREEN_HEIGHT), (5, 8, 10))
    draw = ImageDraw.Draw(image)
    font_title = _load_font(22)
    font_label = _load_font(13)
    font_value = _load_font(16)
    pulse = _pulse(animation_progress) if state.animation == "detail_pulse" else 0.0

    diagnostics = state.diagnostics
    draw.rounded_rectangle((8, 8, 232, 232), radius=14, outline=(50, 62, 72), width=2)
    draw.text((20, 18), "Device", fill=(238, 246, 236), font=font_title)
    draw.text((20, 49), "client diagnostics", fill=(100, 155, 170), font=font_label)

    rows = [
        ("Free", _format_kb(diagnostics.heap_free)),
        ("Block", _format_kb(diagnostics.heap_max_block)),
        ("Frag", f"{diagnostics.heap_fragmentation}%"),
        ("RSSI", f"{diagnostics.wifi_rssi} dBm" if diagnostics.wifi_rssi else "waiting"),
        ("Uptime", _format_uptime(diagnostics.uptime_ms)),
    ]
    for index, (label, value) in enumerate(rows):
        y = 78 + index * 24
        fill = _mix_color((17, 24, 30), (20, 42, 43), pulse * 0.35 if index == 0 else 0.0)
        draw.rounded_rectangle((18, y - 3, 222, y + 18), radius=7, fill=fill)
        draw.text((28, y), label, fill=(112, 150, 158), font=font_label)
        draw.text((94, y - 2), value, fill=(224, 240, 232), font=font_value)

    _draw_detail_back_hint(draw, font_label)
    return image


def _render_renderer_detail_page(*, animation_progress: float) -> Image.Image:
    image = Image.new("RGB", (SCREEN_WIDTH, SCREEN_HEIGHT), (5, 8, 10))
    draw = ImageDraw.Draw(image)
    font_title = _load_font(22)
    font_label = _load_font(13)
    font_value = _load_font(16)
    pulse = _pulse(animation_progress) if animation_progress < 1.0 else 0.0

    draw.rounded_rectangle((8, 8, 232, 232), radius=14, outline=(50, 62, 72), width=2)
    draw.text((20, 18), "Renderer", fill=(238, 246, 236), font=font_title)
    draw.text((20, 49), "remote frame link", fill=(100, 155, 170), font=font_label)

    rows = [
        ("Mode", "HTTP keep-alive"),
        ("Poll", "50 ms"),
        ("Wait", "10 ms"),
        ("Frames", "SDD1 diff"),
    ]
    for index, (label, value) in enumerate(rows):
        y = 84 + index * 28
        draw.rounded_rectangle((18, y - 4, 222, y + 20), radius=8, fill=_mix_color((17, 24, 30), (20, 42, 43), pulse * 0.2))
        draw.text((28, y), label, fill=(112, 150, 158), font=font_label)
        draw.text((92, y - 2), value, fill=(224, 240, 232), font=font_value)

    _draw_detail_back_hint(draw, font_label)
    return image


def _render_about_detail_page(*, device_id: str, animation_progress: float) -> Image.Image:
    image = Image.new("RGB", (SCREEN_WIDTH, SCREEN_HEIGHT), (5, 8, 10))
    draw = ImageDraw.Draw(image)
    font_title = _load_font(22)
    font_label = _load_font(13)
    font_value = _load_font(16)
    pulse = _pulse(animation_progress) if animation_progress < 1.0 else 0.0

    draw.rounded_rectangle((8, 8, 232, 232), radius=14, outline=(50, 62, 72), width=2)
    draw.text((20, 18), "About", fill=(238, 246, 236), font=font_title)
    draw.text((20, 49), "SmallDesktopDisplay", fill=(100, 155, 170), font=font_label)

    rows = [
        ("Device", device_id[:14]),
        ("UI", "remote-render"),
        ("Build", "keep-alive"),
        ("Protocol", "SDD1"),
    ]
    for index, (label, value) in enumerate(rows):
        y = 84 + index * 28
        draw.rounded_rectangle((18, y - 4, 222, y + 20), radius=8, fill=_mix_color((17, 24, 30), (20, 42, 43), pulse * 0.2))
        draw.text((28, y), label, fill=(112, 150, 158), font=font_label)
        draw.text((92, y - 2), value, fill=(224, 240, 232), font=font_value)

    _draw_detail_back_hint(draw, font_label)
    return image


def _render_brightness_detail_page(state: DeviceUiState, *, animation_progress: float) -> Image.Image:
    image = Image.new("RGB", (SCREEN_WIDTH, SCREEN_HEIGHT), (5, 8, 10))
    draw = ImageDraw.Draw(image)
    font_title = _load_font(22)
    font_value = _load_font(42)
    font_body = _load_font(16)
    font_small = _load_font(13)

    value = max(0, min(100, state.pending_brightness))
    adjust_pulse = _pulse(animation_progress) if state.animation in {"brightness_adjust", "brightness_applied"} else 0.0
    eased = ease_out_cubic(animation_progress)
    fill_scale = 0.92 + 0.08 * eased if state.animation == "brightness_adjust" else 1.0
    fill_width = int(170 * value / 100 * fill_scale)

    draw.rounded_rectangle((8, 8, 232, 232), radius=14, outline=(50, 62, 72), width=2)
    draw.text((20, 18), "Brightness", fill=(238, 246, 236), font=font_title)
    draw.text((20, 49), "short cycle  hold apply", fill=(100, 155, 170), font=font_small)

    value_text = f"{value}%"
    value_width = _text_width(draw, value_text, font_value)
    value_y = 82 - int(round(adjust_pulse * 3))
    draw.text(
        ((SCREEN_WIDTH - value_width) // 2, value_y),
        value_text,
        fill=_mix_color((240, 248, 238), (178, 255, 226), adjust_pulse * 0.45),
        font=font_value,
    )

    draw.rounded_rectangle((34, 146, 206, 164), radius=9, fill=(17, 27, 32))
    if fill_width > 0:
        draw.rounded_rectangle((35, 147, 35 + fill_width, 163), radius=8, fill=_mix_color((112, 224, 196), (170, 255, 225), adjust_pulse * 0.55))
    draw.ellipse((30, 141, 48, 169), fill=(34, 44, 50), outline=(93, 118, 124), width=1)
    knob_x = 35 + fill_width
    knob_radius = 8 + int(round(adjust_pulse * 2))
    draw.ellipse((knob_x - knob_radius, 140, knob_x + knob_radius, 170), fill=(220, 248, 236), outline=(77, 155, 145), width=2)

    status = "applied" if state.brightness == state.pending_brightness else f"saved {state.brightness}%"
    draw.text((34, 184), status, fill=(142, 178, 180), font=font_body)

    hint = "double tap back"
    draw.text(((SCREEN_WIDTH - _text_width(draw, hint, font_small)) // 2, 210), hint, fill=(160, 190, 194), font=font_small)
    return image


def _paste_animated_page(
    target: Image.Image,
    page: Image.Image,
    state: DeviceUiState,
    progress: float,
) -> None:
    if state.animation not in {"enter_settings", "enter_detail", "back_home", "back_to_settings"} or progress >= 1.0:
        target.paste(page, (0, 0))
        return

    eased = ease_out_cubic(progress)
    direction = -1 if state.animation in {"back_home", "back_to_settings"} else 1
    offset_x = int(round(direction * (1.0 - eased) * 18))
    alpha = int(120 + 135 * eased)
    layer = page.convert("RGBA")
    layer.putalpha(alpha)
    target.paste(layer, (offset_x, 0), layer)


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


def _mix_color(a: tuple[int, int, int], b: tuple[int, int, int], amount: float) -> tuple[int, int, int]:
    amount = max(0.0, min(1.0, amount))
    return tuple(int(round(start + (end - start) * amount)) for start, end in zip(a, b))


def _format_kb(bytes_value: int) -> str:
    if bytes_value <= 0:
        return "waiting"
    return f"{bytes_value // 1024} KB"


def _format_uptime(uptime_ms: int) -> str:
    if uptime_ms <= 0:
        return "waiting"
    seconds = uptime_ms // 1000
    minutes = seconds // 60
    hours = minutes // 60
    if hours > 0:
        return f"{hours}h {minutes % 60}m"
    if minutes > 0:
        return f"{minutes}m {seconds % 60}s"
    return f"{seconds}s"


def _draw_detail_back_hint(draw: ImageDraw.ImageDraw, font: ImageFont.FreeTypeFont | ImageFont.ImageFont) -> None:
    hint = "double tap back"
    draw.text(
        ((SCREEN_WIDTH - _text_width(draw, hint, font)) // 2, 210),
        hint,
        fill=(160, 190, 194),
        font=font,
    )


def _pulse(progress: float) -> float:
    progress = max(0.0, min(1.0, progress))
    return 1.0 - abs(progress * 2.0 - 1.0)


def _crop_rect(image: Image.Image, region: tuple[int, int, int, int]) -> FrameRect:
    left, top, right, bottom = region
    cropped = image.crop(region)
    return compress_rect_if_smaller(
        FrameRect(
            left,
            top,
            right - left,
            bottom - top,
            rgb888_to_rgb565_bytes(cropped.tobytes()),
        )
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
