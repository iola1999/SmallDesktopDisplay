from app.renderer import SCREEN_HEIGHT, SCREEN_WIDTH, render_device_view


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
