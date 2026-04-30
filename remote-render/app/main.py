from __future__ import annotations

from typing import Literal

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field

from app.state import DeviceRegistry

app = FastAPI(title="SmallDesktopDisplay Remote Renderer")
registry = DeviceRegistry()


class InputEvent(BaseModel):
    seq: int = Field(ge=1)
    event: Literal["short_press", "double_press", "long_press"]
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
    frame = registry.get_frame(device_id=device_id, have=have, wait_ms=wait_ms)
    if frame is None:
        return Response(status_code=204)
    return Response(content=frame, media_type="application/octet-stream")


@app.post("/api/v1/devices/{device_id}/input")
def post_input(device_id: str, event: InputEvent) -> Response:
    if not device_id:
        raise HTTPException(status_code=400, detail="device_id is required")
    registry.record_input(device_id=device_id, seq=event.seq, event=event.event)
    return Response(status_code=202)
