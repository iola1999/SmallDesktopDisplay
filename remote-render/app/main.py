from __future__ import annotations

from dataclasses import asdict
from typing import Literal

from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.responses import Response
from pydantic import BaseModel, Field

from app.protocol import split_frame_for_websocket
from app.state import DeviceRegistry

app = FastAPI(title="SmallDesktopDisplay Remote Renderer")
registry = DeviceRegistry()

WEBSOCKET_MAX_MESSAGE_BYTES = 8192


class InputEvent(BaseModel):
    seq: int = Field(ge=1)
    event: Literal["short_press", "double_press", "long_press"]
    uptime_ms: int = Field(ge=0)


class DeviceStatus(BaseModel):
    brightness: int = Field(ge=0, le=100)
    uptime_ms: int = Field(ge=0)


@app.get("/api/v1/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/v1/devices/{device_id}/frame")
def get_frame(
    device_id: str,
    have: int = Query(ge=0),
    wait_ms: int = Query(default=250, ge=0, le=5000),
) -> Response:
    result = registry.get_frame_with_stats(
        device_id=device_id,
        have=have,
        wait_ms=wait_ms,
    )
    headers = {
        "X-SDD-Server-Wait-Ms": str(result.wait_ms),
        "X-SDD-Server-Render-Ms": str(result.render_ms),
        "X-SDD-Server-Total-Ms": str(result.total_ms),
    }
    if result.frame is None:
        return Response(status_code=204, headers=headers)
    return Response(
        content=result.frame,
        media_type="application/octet-stream",
        headers=headers,
    )


@app.websocket("/api/v1/devices/{device_id}/frames/ws")
async def websocket_frames(
    websocket: WebSocket,
    device_id: str,
    have: int = Query(ge=0),
    wait_ms: int = Query(default=50, ge=0, le=5000),
) -> None:
    await websocket.accept()
    client_have = have
    try:
        while True:
            request = await websocket.receive_json()
            request_have = request.get("have")
            if isinstance(request_have, int) and request_have >= 0:
                client_have = request_have

            result = registry.get_frame_with_stats(
                device_id=device_id,
                have=client_have,
                wait_ms=wait_ms,
            )
            if result.frame is not None:
                frame_id = int.from_bytes(result.frame[8:12], "little")
                chunks = split_frame_for_websocket(
                    result.frame,
                    max_message_bytes=WEBSOCKET_MAX_MESSAGE_BYTES,
                )
                await websocket.send_json(
                    {
                        "type": "frame",
                        "frame_id": frame_id,
                        "wait_ms": result.wait_ms,
                        "render_ms": result.render_ms,
                        "total_ms": result.total_ms,
                        "bytes": len(result.frame),
                        "chunks": len(chunks),
                    }
                )
                for chunk in chunks:
                    await websocket.send_bytes(chunk)
            else:
                await websocket.send_json(
                    {
                        "type": "not_modified",
                        "wait_ms": result.wait_ms,
                        "render_ms": result.render_ms,
                        "total_ms": result.total_ms,
                    }
                )
    except WebSocketDisconnect:
        return


@app.post("/api/v1/devices/{device_id}/input")
def post_input(device_id: str, event: InputEvent) -> Response:
    if not device_id:
        raise HTTPException(status_code=400, detail="device_id is required")
    accepted = registry.record_input(
        device_id=device_id,
        seq=event.seq,
        event=event.event,
        uptime_ms=event.uptime_ms,
    )
    print(
        f"[RemoteInput] {'accepted' if accepted else 'ignored'} "
        f"device={device_id} seq={event.seq} uptime_ms={event.uptime_ms}",
        flush=True,
    )
    return Response(status_code=202)


@app.get("/api/v1/devices/{device_id}/commands", response_model=None)
def get_commands(
    device_id: str,
    after: int = Query(ge=0),
):
    command = registry.get_command(device_id=device_id, after=after)
    if command is None:
        return Response(status_code=204)
    return asdict(command)


@app.post("/api/v1/devices/{device_id}/status")
def post_status(device_id: str, status: DeviceStatus) -> Response:
    if not device_id:
        raise HTTPException(status_code=400, detail="device_id is required")
    registry.record_status(
        device_id=device_id,
        brightness=status.brightness,
        uptime_ms=status.uptime_ms,
    )
    return Response(status_code=202)
