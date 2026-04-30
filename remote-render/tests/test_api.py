from fastapi.testclient import TestClient

from app.main import app


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
    assert base_frame_id == 0
