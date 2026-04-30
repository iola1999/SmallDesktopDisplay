from __future__ import annotations

import threading
import time
from dataclasses import dataclass

from app.protocol import encode_frame
from app.renderer import RenderedFrame, SCREEN_HEIGHT, SCREEN_WIDTH, render_device_view


@dataclass
class DeviceState:
    device_id: str
    frame_id: int = 0
    button_count: int = 0
    last_input_seq: int = 0
    frame: bytes = b""


class DeviceRegistry:
    def __init__(self) -> None:
        self._condition = threading.Condition()
        self._devices: dict[str, DeviceState] = {}

    def get_frame(self, device_id: str, have: int, wait_ms: int) -> bytes | None:
        deadline = time.monotonic() + max(0, min(wait_ms, 5000)) / 1000.0
        with self._condition:
            state = self._ensure_device_locked(device_id)
            while state.frame_id <= have:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    return None
                self._condition.wait(timeout=remaining)
                state = self._ensure_device_locked(device_id)
            return state.frame

    def record_input(self, device_id: str, seq: int, event: str) -> DeviceState:
        with self._condition:
            state = self._ensure_device_locked(device_id)
            if seq > state.last_input_seq:
                state.last_input_seq = seq
                state.button_count += 1
                self._render_locked(state)
                self._condition.notify_all()
            return state

    def _ensure_device_locked(self, device_id: str) -> DeviceState:
        state = self._devices.get(device_id)
        if state is None:
            state = DeviceState(device_id=device_id)
            self._render_locked(state)
            self._devices[device_id] = state
        return state

    def _render_locked(self, state: DeviceState) -> None:
        state.frame_id += 1
        rendered = render_device_view(
            device_id=state.device_id,
            button_count=state.button_count,
            frame_id=state.frame_id,
        )
        state.frame = encode_rendered_frame(rendered)


def encode_rendered_frame(frame: RenderedFrame) -> bytes:
    return encode_frame(
        frame_id=frame.frame_id,
        base_frame_id=frame.base_frame_id,
        width=SCREEN_WIDTH,
        height=SCREEN_HEIGHT,
        rects=frame.rects,
        full_frame=frame.full_frame,
    )
