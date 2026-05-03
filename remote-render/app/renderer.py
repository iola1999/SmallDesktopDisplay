from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

from app.protocol import FrameRect, compress_rect_if_smaller, rgb888_to_rgb565_bytes
from app.ui_state import (
    FONT_LABELS,
    FONT_MAPLE_MONO_NF_CN,
    FONT_NOTO_CJK,
    FONT_WENKAI_SCREEN,
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
SUPERSAMPLE_SCALE = 2
FALLBACK_FONT_CANDIDATES = (
    Path("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"),
    Path("/System/Library/Fonts/PingFang.ttc"),
    Path("/System/Library/Fonts/STHeiti Light.ttc"),
    Path("/System/Library/Fonts/Supplemental/Arial.ttf"),
    Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
    Path("/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf"),
)
FONT_CANDIDATES_BY_KEY = {
    FONT_WENKAI_SCREEN: (
        Path("/usr/local/share/fonts/lxgw-wenkai-screen/LXGWWenKaiScreen.ttf"),
        Path("/usr/share/fonts/truetype/lxgw-wenkai-screen/LXGWWenKaiScreen.ttf"),
        Path.home() / "Library/Fonts/LXGWWenKaiScreen.ttf",
        Path("/Library/Fonts/LXGWWenKaiScreen.ttf"),
    ),
    FONT_MAPLE_MONO_NF_CN: (
        Path("/usr/local/share/fonts/maple-mono-nf-cn/MapleMono-NF-CN-Regular.ttf"),
        Path("/usr/share/fonts/truetype/maple-mono-nf-cn/MapleMono-NF-CN-Regular.ttf"),
        Path.home() / "Library/Fonts/MapleMono-NF-CN-Regular.ttf",
        Path("/Library/Fonts/MapleMono-NF-CN-Regular.ttf"),
    ),
    FONT_NOTO_CJK: (Path("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"),),
}
FONT_CANDIDATES = FONT_CANDIDATES_BY_KEY[FONT_WENKAI_SCREEN]


class _ScaledDraw:
    def __init__(self, image: Image.Image, scale: int) -> None:
        self._draw = ImageDraw.Draw(image)
        self._scale = max(1, scale)

    def rounded_rectangle(self, xy, *, radius=0, width=1, **kwargs) -> None:
        self._draw.rounded_rectangle(
            self._box(xy),
            radius=self._scalar(radius),
            width=max(1, self._scalar(width)),
            **kwargs,
        )

    def ellipse(self, xy, *, width=1, **kwargs) -> None:
        self._draw.ellipse(self._box(xy), width=max(1, self._scalar(width)), **kwargs)

    def line(self, xy, *, width=1, **kwargs) -> None:
        self._draw.line(self._coords(xy), width=max(1, self._scalar(width)), **kwargs)

    def text(self, xy, text: str, **kwargs) -> None:
        self._draw.text(self._point(xy), text, **kwargs)

    def textbbox(self, xy, text: str, **kwargs) -> tuple[int, int, int, int]:
        box = self._draw.textbbox(self._point(xy), text, **kwargs)
        return tuple(int(round(value / self._scale)) for value in box)

    def _scalar(self, value: int | float) -> int:
        return int(round(value * self._scale))

    def _point(self, xy) -> tuple[int, int]:
        return (self._scalar(xy[0]), self._scalar(xy[1]))

    def _box(self, xy) -> tuple[int, int, int, int]:
        return tuple(self._scalar(value) for value in xy)

    def _coords(self, xy) -> tuple[int, ...]:
        return tuple(self._scalar(value) for value in xy)


@dataclass(frozen=True)
class RenderedFrame:
    frame_id: int
    base_frame_id: int
    full_frame: bool
    rects: list[FrameRect]


@dataclass(frozen=True)
class HomeCopy:
    date_text: str
    weekday_text: str
    time_text: str
    seconds_text: str
    greeting: str
    subtitle: str


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
    state = ui_state or DeviceUiState()
    font_key = state.font_key
    if state.page == "detail" and SETTINGS_ITEMS[state.detail_index % len(SETTINGS_ITEMS)] == "Font":
        font_key = state.pending_font_key
    scale = SUPERSAMPLE_SCALE
    font_time = _load_font(52, font_key=font_key, scale=scale)
    font_date = _load_font(20, font_key=font_key, scale=scale)
    font_label = _load_font(16, font_key=font_key, scale=scale)
    font_footer = _load_font(18, font_key=font_key, scale=scale)

    image = _new_canvas((5, 8, 10))
    if state.page == "settings":
        page = _render_settings_page(state, animation_progress=animation_progress, font_key=font_key, scale=scale)
    elif state.page == "detail":
        page = _render_detail_page(state, device_id=device_id, animation_progress=animation_progress, font_key=font_key, scale=scale)
    else:
        page = _render_home_page(
            current_time=current_time,
            state=state,
            animation_progress=animation_progress,
            font_time=font_time,
            font_date=font_date,
            font_label=font_label,
            font_footer=font_footer,
            scale=scale,
        )

    _paste_animated_page(image, page, state, animation_progress, scale=scale)
    return _downsample_canvas(image)


def _render_home_page(
    *,
    current_time: datetime,
    state: DeviceUiState,
    animation_progress: float,
    font_time: ImageFont.FreeTypeFont | ImageFont.ImageFont,
    font_date: ImageFont.FreeTypeFont | ImageFont.ImageFont,
    font_label: ImageFont.FreeTypeFont | ImageFont.ImageFont,
    font_footer: ImageFont.FreeTypeFont | ImageFont.ImageFont,
    scale: int,
) -> Image.Image:
    image = _new_canvas((5, 8, 10))
    draw = _ScaledDraw(image, scale)
    copy = build_home_copy(current_time)

    _draw_home_background(draw)

    date_line = f"{copy.date_text}  {copy.weekday_text}"
    date_width = _text_width(draw, date_line, font_date)
    draw.text(((SCREEN_WIDTH - date_width) // 2, 25), date_line, fill=(172, 200, 194), font=font_date)

    time_text = copy.time_text
    time_box = draw.textbbox((0, 0), time_text, font=font_time)
    time_width = time_box[2] - time_box[0]
    seconds_width = _text_width(draw, copy.seconds_text, font_footer)
    time_left = (SCREEN_WIDTH - time_width - seconds_width - 5) // 2
    draw.text((time_left, 68), time_text, fill=(240, 248, 238), font=font_time)
    draw.text((time_left + time_width + 5, 92), copy.seconds_text, fill=(128, 218, 198), font=font_footer)

    greeting_width = _text_width(draw, copy.greeting, font_footer)
    draw.text(
        ((SCREEN_WIDTH - greeting_width) // 2, 140),
        copy.greeting,
        fill=(206, 232, 222),
        font=font_footer,
    )
    subtitle_width = _text_width(draw, copy.subtitle, font_label)
    draw.text(((SCREEN_WIDTH - subtitle_width) // 2, 166), copy.subtitle, fill=(124, 156, 158), font=font_label)

    tap_pulse = _pulse(animation_progress) if state.animation == "home_tap" else 0.0
    status = _home_status_text(state)
    status_box = (46, 202, 194, 221)
    text_box = (75, status_box[1], 183, status_box[3])
    draw.rounded_rectangle(status_box, radius=8, fill=_mix_color((16, 25, 29), (21, 46, 43), tap_pulse))
    draw.ellipse((58, 208, 66, 216), fill=_mix_color((66, 160, 142), (130, 252, 214), tap_pulse))
    draw.text(_text_position_in_box(draw, status, font_label, text_box), status, fill=(154, 184, 184), font=font_label)

    return image


def build_home_copy(current_time: datetime) -> HomeCopy:
    return HomeCopy(
        date_text=f"{_chinese_month(current_time.month)}月{_chinese_day(current_time.day)}日",
        weekday_text=_chinese_weekday(current_time.weekday()),
        time_text=current_time.strftime("%H:%M"),
        seconds_text=current_time.strftime(":%S"),
        greeting=_greeting_for_hour(current_time.hour),
        subtitle=_subtitle_for_hour(current_time.hour),
    )


def _draw_home_background(draw: ImageDraw.ImageDraw) -> None:
    draw.rounded_rectangle((8, 8, 232, 232), radius=14, fill=(6, 10, 13), outline=(42, 58, 62), width=2)
    draw.rounded_rectangle((16, 16, 224, 224), radius=11, outline=(16, 31, 34), width=1)
    draw.line((32, 55, 208, 55), fill=(20, 38, 39), width=1)
    draw.line((42, 132, 198, 132), fill=(18, 34, 36), width=1)
    draw.ellipse((26, 28, 31, 33), fill=(67, 154, 139))
    draw.ellipse((209, 28, 214, 33), fill=(36, 78, 80))


def _home_status_text(state: DeviceUiState) -> str:
    if state.diagnostics.wifi_rssi < 0:
        return f"已同步  {state.diagnostics.wifi_rssi}dBm"
    return "已同步"


def _chinese_month(month: int) -> str:
    names = ("一", "二", "三", "四", "五", "六", "七", "八", "九", "十", "十一", "十二")
    return names[max(1, min(12, month)) - 1]


def _chinese_day(day: int) -> str:
    return _chinese_number(max(1, min(31, day)))


def _chinese_number(value: int) -> str:
    digits = ("零", "一", "二", "三", "四", "五", "六", "七", "八", "九")
    if value <= 10:
        return "十" if value == 10 else digits[value]
    if value < 20:
        return "十" + digits[value - 10]
    tens = value // 10
    ones = value % 10
    if ones == 0:
        return digits[tens] + "十"
    return digits[tens] + "十" + digits[ones]


def _chinese_weekday(weekday: int) -> str:
    names = ("星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日")
    return names[max(0, min(6, weekday))]


def _greeting_for_hour(hour: int) -> str:
    if 5 <= hour < 11:
        return "早上好"
    if 11 <= hour < 14:
        return "中午好"
    if 14 <= hour < 18:
        return "下午好"
    if 18 <= hour < 23:
        return "晚上好"
    return "夜深了"


def _subtitle_for_hour(hour: int) -> str:
    if 5 <= hour < 11:
        return "今天也慢慢开始"
    if 11 <= hour < 14:
        return "记得好好吃饭"
    if 14 <= hour < 18:
        return "保持清醒，慢慢来"
    if 18 <= hour < 23:
        return "收一收，缓一缓"
    return "早点休息也很好"


def _render_settings_page(state: DeviceUiState, *, animation_progress: float, font_key: str, scale: int) -> Image.Image:
    image = _new_canvas((6, 9, 13))
    draw = _ScaledDraw(image, scale)
    font_title = _load_font(24, font_key=font_key, scale=scale)
    font_item = _load_font(17, font_key=font_key, scale=scale)
    font_small = _load_font(13, font_key=font_key, scale=scale)
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
        elif item == "Font":
            value = FONT_LABELS.get(state.font_key, "Font")
            draw.text((174, y + 6 + row_shift), value, fill=text_fill, font=font_small)
        elif item == "Device" and state.diagnostics.heap_free > 0:
            value = _format_kb(state.diagnostics.heap_free)
            draw.text((178, y + 6 + row_shift), value, fill=text_fill, font=font_small)
        elif item == "Renderer":
            draw.text((177, y + 6 + row_shift), "HTTP", fill=text_fill, font=font_small)

    return image


def _render_detail_page(state: DeviceUiState, *, device_id: str, animation_progress: float, font_key: str, scale: int) -> Image.Image:
    if state.detail_index == 0:
        return _render_brightness_detail_page(state, animation_progress=animation_progress, font_key=font_key, scale=scale)
    if SETTINGS_ITEMS[state.detail_index % len(SETTINGS_ITEMS)] == "Font":
        return _render_font_detail_page(state, animation_progress=animation_progress, font_key=font_key, scale=scale)
    if SETTINGS_ITEMS[state.detail_index % len(SETTINGS_ITEMS)] == "Device":
        return _render_device_detail_page(state, animation_progress=animation_progress, font_key=font_key, scale=scale)
    if SETTINGS_ITEMS[state.detail_index % len(SETTINGS_ITEMS)] == "Renderer":
        return _render_renderer_detail_page(state, animation_progress=animation_progress, font_key=font_key, scale=scale)
    if SETTINGS_ITEMS[state.detail_index % len(SETTINGS_ITEMS)] == "About":
        return _render_about_detail_page(device_id=device_id, animation_progress=animation_progress, font_key=font_key, scale=scale)

    image = _new_canvas((5, 8, 10))
    draw = _ScaledDraw(image, scale)
    font_title = _load_font(22, font_key=font_key, scale=scale)
    font_body = _load_font(18, font_key=font_key, scale=scale)
    font_small = _load_font(13, font_key=font_key, scale=scale)

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


def _render_font_detail_page(state: DeviceUiState, *, animation_progress: float, font_key: str, scale: int) -> Image.Image:
    image = _new_canvas((5, 8, 10))
    draw = _ScaledDraw(image, scale)
    font_title = _load_font(22, font_key=font_key, scale=scale)
    font_label = _load_font(13, font_key=font_key, scale=scale)
    font_value = _load_font(25, font_key=font_key, scale=scale)
    font_preview = _load_font(17, font_key=font_key, scale=scale)
    pulse = _pulse(animation_progress) if state.animation in {"font_select", "font_applied"} else 0.0

    label = FONT_LABELS.get(state.pending_font_key, "Font")
    status = "applied" if state.font_key == state.pending_font_key else "preview"
    draw.rounded_rectangle((8, 8, 232, 232), radius=14, outline=(50, 62, 72), width=2)
    draw.text((20, 18), "Font", fill=(238, 246, 236), font=font_title)
    draw.text((20, 49), "short cycle  hold apply", fill=(100, 155, 170), font=font_label)

    draw.rounded_rectangle((18, 80, 222, 169), radius=12, fill=_mix_color((18, 29, 34), (24, 48, 47), pulse * 0.35))
    draw.text(_text_position_in_box(draw, label, font_value, (28, 86, 212, 116)), label, fill=(238, 246, 236), font=font_value)
    sample = "五月四日  夜深了"
    draw.text(_text_position_in_box(draw, sample, font_preview, (28, 126, 212, 154)), sample, fill=(158, 216, 200), font=font_preview)

    draw.text((34, 184), status, fill=_mix_color((142, 178, 180), (178, 255, 226), pulse * 0.45), font=font_preview)
    hint = "double tap back"
    draw.text(((SCREEN_WIDTH - _text_width(draw, hint, font_label)) // 2, 210), hint, fill=(160, 190, 194), font=font_label)
    return image


def _render_device_detail_page(state: DeviceUiState, *, animation_progress: float, font_key: str, scale: int) -> Image.Image:
    image = _new_canvas((5, 8, 10))
    draw = _ScaledDraw(image, scale)
    font_title = _load_font(22, font_key=font_key, scale=scale)
    font_label = _load_font(13, font_key=font_key, scale=scale)
    font_value = _load_font(16, font_key=font_key, scale=scale)
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


def _render_renderer_detail_page(state: DeviceUiState, *, animation_progress: float, font_key: str, scale: int) -> Image.Image:
    image = _new_canvas((5, 8, 10))
    draw = _ScaledDraw(image, scale)
    font_title = _load_font(22, font_key=font_key, scale=scale)
    font_label = _load_font(13, font_key=font_key, scale=scale)
    font_value = _load_font(16, font_key=font_key, scale=scale)
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


def _render_about_detail_page(*, device_id: str, animation_progress: float, font_key: str, scale: int) -> Image.Image:
    image = _new_canvas((5, 8, 10))
    draw = _ScaledDraw(image, scale)
    font_title = _load_font(22, font_key=font_key, scale=scale)
    font_label = _load_font(13, font_key=font_key, scale=scale)
    font_value = _load_font(16, font_key=font_key, scale=scale)
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


def _render_brightness_detail_page(state: DeviceUiState, *, animation_progress: float, font_key: str, scale: int) -> Image.Image:
    image = _new_canvas((5, 8, 10))
    draw = _ScaledDraw(image, scale)
    font_title = _load_font(22, font_key=font_key, scale=scale)
    font_value = _load_font(42, font_key=font_key, scale=scale)
    font_body = _load_font(16, font_key=font_key, scale=scale)
    font_small = _load_font(13, font_key=font_key, scale=scale)

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
    *,
    scale: int,
) -> None:
    if state.animation not in {"enter_settings", "enter_detail", "back_home", "back_to_settings"} or progress >= 1.0:
        target.paste(page, (0, 0))
        return

    eased = ease_out_cubic(progress)
    direction = -1 if state.animation in {"back_home", "back_to_settings"} else 1
    offset_x = int(round(direction * (1.0 - eased) * 18 * scale))
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


def _new_canvas(fill: tuple[int, int, int]) -> Image.Image:
    return Image.new(
        "RGB",
        (SCREEN_WIDTH * SUPERSAMPLE_SCALE, SCREEN_HEIGHT * SUPERSAMPLE_SCALE),
        fill,
    )


def _downsample_canvas(image: Image.Image) -> Image.Image:
    if image.size == (SCREEN_WIDTH, SCREEN_HEIGHT):
        return image
    return image.resize(
        (SCREEN_WIDTH, SCREEN_HEIGHT),
        Image.Resampling.BOX,
    ).filter(ImageFilter.UnsharpMask(radius=0.5, percent=60, threshold=2))


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


def _load_font(size: int, *, font_key: str = FONT_WENKAI_SCREEN, scale: int = SUPERSAMPLE_SCALE) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = FONT_CANDIDATES_BY_KEY.get(font_key, FONT_CANDIDATES) + FALLBACK_FONT_CANDIDATES
    for path in candidates:
        try:
            return ImageFont.truetype(str(path), size * scale)
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


def _text_position_in_box(
    draw: ImageDraw.ImageDraw,
    text: str,
    font: ImageFont.FreeTypeFont | ImageFont.ImageFont,
    box: tuple[int, int, int, int],
) -> tuple[int, int]:
    text_box = draw.textbbox((0, 0), text, font=font)
    text_width = text_box[2] - text_box[0]
    text_height = text_box[3] - text_box[1]
    box_width = box[2] - box[0]
    box_height = box[3] - box[1]
    x = box[0] + max(0, box_width - text_width) // 2 - text_box[0]
    y = box[1] + max(0, box_height - text_height) // 2 - text_box[1]
    return x, y
