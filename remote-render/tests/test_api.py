from fastapi.testclient import TestClient

from app.main import app, registry
from app.state import DeviceRegistry
from tools.frame_preview import decode_frame


def test_frame_endpoint_returns_latest_frame_then_204_for_same_have():
    client = TestClient(app)

    first = client.get("/api/v1/devices/desk-01/frame?have=0")
    assert first.status_code == 200
    assert first.headers["content-type"] == "application/octet-stream"

    frame_id = int.from_bytes(first.content[8:12], "little")
    second = client.get(f"/api/v1/devices/desk-01/frame?have={frame_id}&wait_ms=1")
    assert second.status_code == 204


def test_button_input_advances_latest_frame_without_replaying_old_frames():
    client = TestClient(app)

    first = client.get("/api/v1/devices/desk-02/frame?have=0")
    first_frame_id = int.from_bytes(first.content[8:12], "little")

    response = client.post(
        "/api/v1/devices/desk-02/input",
        json={"seq": 1, "event": "short_press", "uptime_ms": 1000},
    )
    assert response.status_code == 202

    next_frame = client.get(
        f"/api/v1/devices/desk-02/frame?have={first_frame_id}&wait_ms=1"
    )
    assert next_frame.status_code == 200
    next_frame_id = int.from_bytes(next_frame.content[8:12], "little")
    base_frame_id = int.from_bytes(next_frame.content[12:16], "little")

    assert next_frame_id > first_frame_id
    assert base_frame_id == first_frame_id


def test_registry_refreshes_clock_with_partial_frame_after_tick():
    now = 0.0

    def monotonic() -> float:
        return now

    registry = DeviceRegistry(monotonic=monotonic, frame_interval_seconds=1.0)

    first = registry.get_frame(device_id="desk-clock", have=0, wait_ms=0)
    assert first is not None
    first_frame_id = int.from_bytes(first[8:12], "little")
    first_payload_len = int.from_bytes(first[22:26], "little")

    now = 1.1
    second = registry.get_frame(
        device_id="desk-clock",
        have=first_frame_id,
        wait_ms=0,
    )

    assert second is not None
    second_frame_id = int.from_bytes(second[8:12], "little")
    second_payload_len = int.from_bytes(second[22:26], "little")

    assert second_frame_id > first_frame_id
    assert second_payload_len < first_payload_len


def test_registry_returns_full_frame_for_cold_client_after_partial_update():
    now = 0.0

    def monotonic() -> float:
        return now

    registry = DeviceRegistry(monotonic=monotonic, frame_interval_seconds=1.0)

    first = registry.get_frame(device_id="desk-reboot", have=0, wait_ms=0)
    assert first is not None
    first_frame_id = int.from_bytes(first[8:12], "little")

    now = 1.1
    partial = registry.get_frame(
        device_id="desk-reboot",
        have=first_frame_id,
        wait_ms=0,
    )
    assert partial is not None
    assert partial[5] & 0x01 == 0

    cold_client_frame = registry.get_frame(device_id="desk-reboot", have=0, wait_ms=0)

    assert cold_client_frame is not None
    assert cold_client_frame[5] & 0x01 == 0x01
    decoded = decode_frame(cold_client_frame)
    assert decoded.full_frame
    assert len(decoded.rects) == 1
    assert (decoded.rects[0].width, decoded.rects[0].height) == (240, 240)


def test_registry_returns_full_frame_when_client_frame_id_is_ahead_after_restart():
    registry = DeviceRegistry()

    frame = registry.get_frame(device_id="desk-after-server-restart", have=999, wait_ms=0)

    assert frame is not None
    assert frame[5] & 0x01 == 0x01
    decoded = decode_frame(frame)
    assert decoded.full_frame
    assert len(decoded.rects) == 1
    assert (decoded.rects[0].width, decoded.rects[0].height) == (240, 240)


def test_registry_renders_animation_frames_after_navigation_input():
    now = 0.0

    def monotonic() -> float:
        return now

    registry = DeviceRegistry(monotonic=monotonic, frame_interval_seconds=1.0)

    first = registry.get_frame(device_id="desk-ui", have=0, wait_ms=0)
    assert first is not None
    first_frame_id = int.from_bytes(first[8:12], "little")

    registry.record_input(device_id="desk-ui", seq=1, event="long_press")
    animated = registry.get_frame(device_id="desk-ui", have=first_frame_id, wait_ms=0)
    assert animated is not None
    animated_frame_id = int.from_bytes(animated[8:12], "little")

    now = 0.05
    next_animation_frame = registry.get_frame(
        device_id="desk-ui",
        have=animated_frame_id,
        wait_ms=0,
    )

    assert next_animation_frame is not None
    assert int.from_bytes(next_animation_frame[8:12], "little") > animated_frame_id
    assert int.from_bytes(next_animation_frame[12:16], "little") == animated_frame_id
    assert int.from_bytes(next_animation_frame[22:26], "little") < 5000


def test_registry_accepts_restarted_device_input_sequence_when_uptime_goes_back():
    registry = DeviceRegistry()

    registry.get_frame(device_id="desk-input-restart", have=0, wait_ms=0)
    assert registry.record_input(
        device_id="desk-input-restart",
        seq=50,
        event="long_press",
        uptime_ms=100_000,
    )
    state = registry._devices["desk-input-restart"]
    assert state.ui.page == "settings"
    assert state.ui.selected_index == 0

    assert registry.record_input(
        device_id="desk-input-restart",
        seq=1,
        event="short_press",
        uptime_ms=1_000,
    )
    assert state.ui.page == "settings"
    assert state.ui.selected_index == 1


def test_registry_ignores_stale_input_sequence_when_uptime_keeps_moving_forward():
    registry = DeviceRegistry()

    registry.get_frame(device_id="desk-input-stale", have=0, wait_ms=0)
    assert registry.record_input(
        device_id="desk-input-stale",
        seq=5,
        event="long_press",
        uptime_ms=1_000,
    )
    state = registry._devices["desk-input-stale"]

    assert not registry.record_input(
        device_id="desk-input-stale",
        seq=4,
        event="short_press",
        uptime_ms=2_000,
    )
    assert state.ui.page == "settings"
    assert state.ui.selected_index == 0


def test_registry_returns_full_frame_when_client_missed_partial_base():
    now = 0.0

    def monotonic() -> float:
        return now

    registry = DeviceRegistry(monotonic=monotonic, frame_interval_seconds=1.0)

    first = registry.get_frame(device_id="desk-stale-animation", have=0, wait_ms=0)
    assert first is not None
    first_frame_id = int.from_bytes(first[8:12], "little")

    registry.record_input(device_id="desk-stale-animation", seq=1, event="long_press")
    first_animation = registry.get_frame(
        device_id="desk-stale-animation",
        have=first_frame_id,
        wait_ms=0,
    )
    assert first_animation is not None
    first_animation_id = int.from_bytes(first_animation[8:12], "little")
    assert first_animation[5] & 0x01 == 0

    now = 0.05
    second_animation = registry.get_frame(
        device_id="desk-stale-animation",
        have=first_animation_id,
        wait_ms=0,
    )
    assert second_animation is not None
    assert second_animation[5] & 0x01 == 0

    stale_client_frame = registry.get_frame(
        device_id="desk-stale-animation",
        have=first_frame_id,
        wait_ms=0,
    )

    assert stale_client_frame is not None
    assert stale_client_frame[5] & 0x01 == 0x01
    decoded = decode_frame(stale_client_frame)
    assert decoded.full_frame
    assert len(decoded.rects) == 1
    assert (decoded.rects[0].width, decoded.rects[0].height) == (240, 240)


def test_registry_back_to_home_redraws_more_than_footer_region():
    registry = DeviceRegistry()

    first = registry.get_frame(device_id="desk-back-home", have=0, wait_ms=0)
    assert first is not None
    first_frame_id = int.from_bytes(first[8:12], "little")

    registry.record_input(
        device_id="desk-back-home",
        seq=1,
        event="long_press",
        uptime_ms=1_000,
    )
    settings_frame = registry.get_frame(
        device_id="desk-back-home",
        have=first_frame_id,
        wait_ms=0,
    )
    assert settings_frame is not None
    settings_frame_id = int.from_bytes(settings_frame[8:12], "little")

    registry.record_input(
        device_id="desk-back-home",
        seq=2,
        event="double_press",
        uptime_ms=2_000,
    )
    home_frame = registry.get_frame(
        device_id="desk-back-home",
        have=settings_frame_id,
        wait_ms=0,
    )

    assert home_frame is not None
    decoded = decode_frame(home_frame)
    raw_covered_bytes = sum(rect.width * rect.height * 2 for rect in decoded.rects)
    assert raw_covered_bytes > 60000


def test_registry_queues_brightness_command_from_detail_confirm():
    registry = DeviceRegistry()
    device_id = "desk-brightness-command"

    registry.get_frame(device_id=device_id, have=0, wait_ms=0)
    assert registry.record_input(device_id=device_id, seq=1, event="long_press", uptime_ms=100)
    assert registry.record_input(device_id=device_id, seq=2, event="long_press", uptime_ms=800)
    assert registry.record_input(device_id=device_id, seq=3, event="short_press", uptime_ms=1200)
    assert registry.record_input(device_id=device_id, seq=4, event="long_press", uptime_ms=1800)

    command = registry.get_command(device_id=device_id, after=0)

    assert command is not None
    assert command.id == 1
    assert command.type == "set_brightness"
    assert command.value == 60
    assert command.persist is True


def test_command_endpoint_returns_latest_command_then_204():
    client = TestClient(app)
    device_id = "desk-brightness-api"

    assert client.get(f"/api/v1/devices/{device_id}/frame?have=0").status_code == 200
    assert client.post(
        f"/api/v1/devices/{device_id}/input",
        json={"seq": 1, "event": "long_press", "uptime_ms": 100},
    ).status_code == 202
    assert client.post(
        f"/api/v1/devices/{device_id}/input",
        json={"seq": 2, "event": "long_press", "uptime_ms": 800},
    ).status_code == 202
    assert client.post(
        f"/api/v1/devices/{device_id}/input",
        json={"seq": 3, "event": "long_press", "uptime_ms": 1400},
    ).status_code == 202

    response = client.get(f"/api/v1/devices/{device_id}/commands?after=0")

    assert response.status_code == 200
    assert response.json() == {
        "id": 1,
        "type": "set_brightness",
        "value": 50,
        "persist": True,
    }

    assert client.get(f"/api/v1/devices/{device_id}/commands?after=1").status_code == 204


def test_status_endpoint_updates_remote_brightness_after_restart():
    client = TestClient(app)
    device_id = "desk-brightness-status"

    response = client.post(
        f"/api/v1/devices/{device_id}/status",
        json={"brightness": 80, "uptime_ms": 1234},
    )

    assert response.status_code == 202
    assert registry._devices[device_id].ui.brightness == 80
    assert registry._devices[device_id].ui.pending_brightness == 80


def test_status_endpoint_rejects_invalid_brightness():
    client = TestClient(app)

    response = client.post(
        "/api/v1/devices/desk-invalid-brightness/status",
        json={"brightness": 101, "uptime_ms": 1234},
    )

    assert response.status_code == 422
