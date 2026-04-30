from datetime import datetime
from zoneinfo import ZoneInfo

from PIL import Image

from app.protocol import ENCODING_RGB565_RLE, decode_rgb565_rle
from app.renderer import (
    SCREEN_HEIGHT,
    SCREEN_WIDTH,
    compute_dirty_rects,
    render_canvas_frame,
    render_device_canvas,
    render_device_view,
)
from app.ui_state import DeviceUiState


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


def test_renderer_changes_pixels_when_button_count_changes():
    first = render_device_view(device_id="desk-01", button_count=0)
    second = render_device_view(device_id="desk-01", button_count=3)

    assert first.rects[0].payload != second.rects[0].payload


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
    low_memory = DeviceUiState(page="detail", detail_index=1)
    low_memory.diagnostics.heap_free = 24000
    low_memory.diagnostics.heap_max_block = 18000
    low_memory.diagnostics.heap_fragmentation = 18
    low_memory.diagnostics.wifi_rssi = -70
    low_memory.diagnostics.uptime_ms = 120000

    high_memory = DeviceUiState(page="detail", detail_index=1)
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
