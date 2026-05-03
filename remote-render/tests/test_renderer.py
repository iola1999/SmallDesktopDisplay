from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from PIL import Image, ImageDraw, ImageFont

from app.protocol import ENCODING_RGB565_RLE, decode_rgb565_rle
from app.renderer import (
    FONT_CANDIDATES,
    FONT_CANDIDATES_BY_KEY,
    SCREEN_HEIGHT,
    SCREEN_WIDTH,
    SUPERSAMPLE_SCALE,
    build_home_copy,
    compute_dirty_rects,
    render_canvas_frame,
    render_device_canvas,
    render_device_view,
    _new_canvas,
    _text_position_in_box,
)
from app.ui_state import (
    FONT_MAPLE_MONO_NF_CN,
    FONT_WENKAI_SCREEN,
    DeviceUiState,
)


def test_renderer_defaults_to_lxgw_wenkai_screen_font():
    assert list(FONT_CANDIDATES[:4]) == [
        Path("/usr/local/share/fonts/lxgw-wenkai-screen/LXGWWenKaiScreen.ttf"),
        Path("/usr/share/fonts/truetype/lxgw-wenkai-screen/LXGWWenKaiScreen.ttf"),
        Path.home() / "Library/Fonts/LXGWWenKaiScreen.ttf",
        Path("/Library/Fonts/LXGWWenKaiScreen.ttf"),
    ]


def test_renderer_keeps_maple_mono_available_as_selectable_font():
    assert list(FONT_CANDIDATES_BY_KEY[FONT_MAPLE_MONO_NF_CN][:4]) == [
        Path("/usr/local/share/fonts/maple-mono-nf-cn/MapleMono-NF-CN-Regular.ttf"),
        Path("/usr/share/fonts/truetype/maple-mono-nf-cn/MapleMono-NF-CN-Regular.ttf"),
        Path.home() / "Library/Fonts/MapleMono-NF-CN-Regular.ttf",
        Path("/Library/Fonts/MapleMono-NF-CN-Regular.ttf"),
    ]


def test_text_position_in_box_visually_centers_font_bbox():
    image = Image.new("RGB", (120, 40), (0, 0, 0))
    draw = ImageDraw.Draw(image)
    font = ImageFont.load_default()
    text = "synced"
    box = (10, 8, 110, 31)

    x, y = _text_position_in_box(draw, text, font, box)
    text_box = draw.textbbox((x, y), text, font=font)

    assert (text_box[1] + text_box[3]) // 2 == (box[1] + box[3]) // 2


def test_font_selection_changes_rendered_canvas_when_fonts_are_available():
    if not FONT_CANDIDATES_BY_KEY[FONT_WENKAI_SCREEN][0].exists():
        return

    current_time = datetime(2026, 5, 1, 14, 32, 8, tzinfo=ZoneInfo("Asia/Shanghai"))
    wenkai = render_device_canvas(
        current_time=current_time,
        device_id="desk-01",
        button_count=0,
        ui_state=DeviceUiState(font_key=FONT_WENKAI_SCREEN),
    )
    maple = render_device_canvas(
        current_time=current_time,
        device_id="desk-01",
        button_count=0,
        ui_state=DeviceUiState(font_key=FONT_MAPLE_MONO_NF_CN),
    )

    assert wenkai.tobytes() != maple.tobytes()


def test_renderer_uses_global_2x_supersampling_canvas_before_downsampling():
    assert SUPERSAMPLE_SCALE == 2
    assert _new_canvas((0, 0, 0)).size == (SCREEN_WIDTH * 2, SCREEN_HEIGHT * 2)

    current_time = datetime(2026, 5, 1, 14, 32, 8, tzinfo=ZoneInfo("Asia/Shanghai"))
    canvas = render_device_canvas(
        current_time=current_time,
        device_id="desk-01",
        button_count=0,
    )

    assert canvas.size == (SCREEN_WIDTH, SCREEN_HEIGHT)


def test_renderer_returns_full_screen_rgb565_frame():
    frame = render_device_view(device_id="desk-01", button_count=0)

    assert frame.frame_id == 1
    assert frame.full_frame is True
    assert frame.base_frame_id == 0
    assert len(frame.rects) == 1
    rect = frame.rects[0]
    assert (rect.x, rect.y, rect.width, rect.height) == (
        0,
        0,
        SCREEN_WIDTH,
        SCREEN_HEIGHT,
    )
    assert rect.encoding == ENCODING_RGB565_RLE
    assert len(rect.payload) < SCREEN_WIDTH * SCREEN_HEIGHT * 2
    assert len(decode_rgb565_rle(rect.payload, SCREEN_WIDTH * SCREEN_HEIGHT)) == SCREEN_WIDTH * SCREEN_HEIGHT * 2


def test_renderer_compresses_flat_full_frame_rects():
    image = Image.new("RGB", (SCREEN_WIDTH, SCREEN_HEIGHT), (5, 8, 10))

    frame = render_canvas_frame(image, frame_id=1, full_frame=True)

    rect = frame.rects[0]
    assert rect.encoding == 1
    assert len(rect.payload) < SCREEN_WIDTH * SCREEN_HEIGHT * 2 // 10


def test_renderer_home_frame_ignores_button_count_debug_state():
    now = datetime(2026, 5, 1, 14, 32, 8, tzinfo=ZoneInfo("Asia/Shanghai"))
    first = render_device_view(device_id="desk-01", button_count=0, now=now)
    second = render_device_view(device_id="desk-01", button_count=3, now=now)

    assert first.rects[0].payload == second.rects[0].payload


def test_home_copy_uses_chinese_date_weekday_and_greeting():
    copy = build_home_copy(datetime(2026, 5, 1, 14, 32, 8, tzinfo=ZoneInfo("Asia/Shanghai")))

    assert copy.date_text == "五月一日"
    assert copy.weekday_text == "星期五"
    assert copy.time_text == "14:32"
    assert copy.seconds_text == ":08"
    assert copy.greeting == "下午好"


def test_home_screen_does_not_render_debug_device_or_tap_state():
    current_time = datetime(2026, 5, 1, 14, 32, 8, tzinfo=ZoneInfo("Asia/Shanghai"))

    first = render_device_canvas(
        current_time=current_time,
        device_id="desk-01",
        button_count=0,
    )
    second = render_device_canvas(
        current_time=current_time,
        device_id="debug-device",
        button_count=99,
    )

    assert first.tobytes() == second.tobytes()


def test_renderer_diff_for_second_tick_is_much_smaller_than_time_region():
    first = render_device_canvas(
        current_time=datetime(2026, 5, 1, 12, 34, 56, tzinfo=ZoneInfo("Asia/Shanghai")),
        device_id="desk-01",
        button_count=0,
    )
    second = render_device_canvas(
        current_time=datetime(2026, 5, 1, 12, 34, 57, tzinfo=ZoneInfo("Asia/Shanghai")),
        device_id="desk-01",
        button_count=0,
    )

    rects = compute_dirty_rects(first, second)
    payload_len = sum(len(rect.payload) for rect in rects)

    assert rects
    assert payload_len < 12000


def test_renderer_splits_large_dirty_area_into_small_strips():
    previous = Image.new("RGB", (SCREEN_WIDTH, SCREEN_HEIGHT), (0, 0, 0))
    current = Image.new("RGB", (SCREEN_WIDTH, SCREEN_HEIGHT), (255, 255, 255))

    rects = compute_dirty_rects(previous, current)

    assert len(rects) > 1
    assert max(rect.height for rect in rects) <= 8


def test_renderer_animates_page_entry_without_changing_final_static_frame():
    current_time = datetime(2026, 5, 1, 12, 34, 56, tzinfo=ZoneInfo("Asia/Shanghai"))
    start = render_device_canvas(
        current_time=current_time,
        device_id="desk-01",
        button_count=0,
        ui_state=DeviceUiState(page="settings", animation="enter_settings"),
        animation_progress=0.0,
    )
    static = render_device_canvas(
        current_time=current_time,
        device_id="desk-01",
        button_count=0,
        ui_state=DeviceUiState(page="settings"),
        animation_progress=1.0,
    )
    end = render_device_canvas(
        current_time=current_time,
        device_id="desk-01",
        button_count=0,
        ui_state=DeviceUiState(page="settings", animation="enter_settings"),
        animation_progress=1.0,
    )

    assert start.tobytes() != static.tobytes()
    assert end.tobytes() == static.tobytes()


def test_renderer_animates_settings_selection_highlight():
    current_time = datetime(2026, 5, 1, 12, 34, 56, tzinfo=ZoneInfo("Asia/Shanghai"))
    animated = render_device_canvas(
        current_time=current_time,
        device_id="desk-01",
        button_count=0,
        ui_state=DeviceUiState(page="settings", selected_index=2, animation="settings_select"),
        animation_progress=0.35,
    )
    static = render_device_canvas(
        current_time=current_time,
        device_id="desk-01",
        button_count=0,
        ui_state=DeviceUiState(page="settings", selected_index=2),
        animation_progress=1.0,
    )

    assert animated.tobytes() != static.tobytes()


def test_renderer_animates_brightness_adjustment():
    current_time = datetime(2026, 5, 1, 12, 34, 56, tzinfo=ZoneInfo("Asia/Shanghai"))
    animated = render_device_canvas(
        current_time=current_time,
        device_id="desk-01",
        button_count=0,
        ui_state=DeviceUiState(page="detail", detail_index=0, pending_brightness=80, animation="brightness_adjust"),
        animation_progress=0.35,
    )
    static = render_device_canvas(
        current_time=current_time,
        device_id="desk-01",
        button_count=0,
        ui_state=DeviceUiState(page="detail", detail_index=0, pending_brightness=80),
        animation_progress=1.0,
    )

    assert animated.tobytes() != static.tobytes()


def test_renderer_animates_home_tap_inside_footer_region():
    current_time = datetime(2026, 5, 1, 12, 34, 56, tzinfo=ZoneInfo("Asia/Shanghai"))
    animated = render_device_canvas(
        current_time=current_time,
        device_id="desk-01",
        button_count=1,
        ui_state=DeviceUiState(animation="home_tap"),
        animation_progress=0.45,
    )
    static = render_device_canvas(
        current_time=current_time,
        device_id="desk-01",
        button_count=1,
        ui_state=DeviceUiState(),
        animation_progress=1.0,
    )

    rects = compute_dirty_rects(static, animated)

    assert animated.tobytes() != static.tobytes()
    assert max(rect.y + rect.height for rect in rects) <= 224
    assert min(rect.y for rect in rects) >= 160


def test_renderer_reflects_brightness_pending_value():
    current_time = datetime(2026, 5, 1, 12, 34, 56, tzinfo=ZoneInfo("Asia/Shanghai"))
    dim = render_device_canvas(
        current_time=current_time,
        device_id="desk-01",
        button_count=0,
        ui_state=DeviceUiState(page="detail", detail_index=0, pending_brightness=20),
    )
    bright = render_device_canvas(
        current_time=current_time,
        device_id="desk-01",
        button_count=0,
        ui_state=DeviceUiState(page="detail", detail_index=0, pending_brightness=100),
    )

    assert dim.tobytes() != bright.tobytes()


def test_renderer_reflects_device_diagnostics_detail():
    current_time = datetime(2026, 5, 1, 12, 34, 56, tzinfo=ZoneInfo("Asia/Shanghai"))
    low_memory = DeviceUiState(page="detail", detail_index=2)
    low_memory.diagnostics.heap_free = 24000
    low_memory.diagnostics.heap_max_block = 18000
    low_memory.diagnostics.heap_fragmentation = 18
    low_memory.diagnostics.wifi_rssi = -70
    low_memory.diagnostics.uptime_ms = 120000

    high_memory = DeviceUiState(page="detail", detail_index=2)
    high_memory.diagnostics.heap_free = 42000
    high_memory.diagnostics.heap_max_block = 39000
    high_memory.diagnostics.heap_fragmentation = 4
    high_memory.diagnostics.wifi_rssi = -42
    high_memory.diagnostics.uptime_ms = 120000

    low = render_device_canvas(
        current_time=current_time,
        device_id="desk-01",
        button_count=0,
        ui_state=low_memory,
    )
    high = render_device_canvas(
        current_time=current_time,
        device_id="desk-01",
        button_count=0,
        ui_state=high_memory,
    )

    assert low.tobytes() != high.tobytes()
