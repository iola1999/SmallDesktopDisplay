from datetime import datetime
from zoneinfo import ZoneInfo

from PIL import Image

from app.renderer import (
    SCREEN_HEIGHT,
    SCREEN_WIDTH,
    compute_dirty_rects,
    render_device_canvas,
    render_device_view,
)


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
    assert len(rect.payload) == SCREEN_WIDTH * SCREEN_HEIGHT * 2


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
