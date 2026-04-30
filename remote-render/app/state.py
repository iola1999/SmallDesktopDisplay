from __future__ import annotations

import threading
import time
from collections.abc import Callable
from dataclasses import dataclass

from app.protocol import encode_frame
from app.renderer import (
    FOOTER_REGION,
    TIME_REGION,
    RenderedFrame,
    SCREEN_HEIGHT,
    SCREEN_WIDTH,
    render_device_view,
)


@dataclass
class DeviceState:
    device_id: str
    frame_id: int = 0
    button_count: int = 0
    last_input_seq: int = 0
    last_render_second: int = -1
    frame: bytes = b""
    full_frame: bytes = b""


class DeviceRegistry:
    def __init__(
        self,
        *,
        monotonic: Callable[[], float] = time.monotonic,
        frame_interval_seconds: float = 1.0,
    ) -> None:
        self._condition = threading.Condition()
        self._devices: dict[str, DeviceState] = {}
        self._monotonic = monotonic
        self._frame_interval_seconds = frame_interval_seconds

    def get_frame(self, device_id: str, have: int, wait_ms: int) -> bytes | None:
        deadline = self._monotonic() + max(0, min(wait_ms, 5000)) / 1000.0
        with self._condition:
            state = self._ensure_device_locked(device_id)
            self._render_clock_if_due_locked(state)
            if have == 0 or have > state.frame_id:
                return state.full_frame
            while state.frame_id <= have:
                remaining = deadline - self._monotonic()
                if remaining <= 0:
                    return None
                self._condition.wait(timeout=remaining)
                state = self._ensure_device_locked(device_id)
                self._render_clock_if_due_locked(state)
                if have == 0 or have > state.frame_id:
                    return state.full_frame
            return state.frame

    def record_input(self, device_id: str, seq: int, event: str) -> DeviceState:
        with self._condition:
            state = self._ensure_device_locked(device_id)
            if seq > state.last_input_seq:
                state.last_input_seq = seq
                state.button_count += 1
                self._render_locked(state, full_frame=False, regions=[FOOTER_REGION])
                self._condition.notify_all()
            return state

    def _ensure_device_locked(self, device_id: str) -> DeviceState:
        state = self._devices.get(device_id)
        if state is None:
            state = DeviceState(device_id=device_id)
            self._render_locked(state, full_frame=True)
            self._devices[device_id] = state
        return state

    def _render_clock_if_due_locked(self, state: DeviceState) -> None:
        current_second = int(self._monotonic() / self._frame_interval_seconds)
        if current_second <= state.last_render_second:
            return

        self._render_locked(state, full_frame=False, regions=[TIME_REGION])

    def _render_locked(
        self,
        state: DeviceState,
        *,
        full_frame: bool,
        regions: list[tuple[int, int, int, int]] | None = None,
    ) -> None:
        state.frame_id += 1
        state.last_render_second = int(self._monotonic() / self._frame_interval_seconds)
        rendered = render_device_view(
            device_id=state.device_id,
            button_count=state.button_count,
            frame_id=state.frame_id,
            base_frame_id=0,
            full_frame=full_frame,
            regions=regions,
        )
        state.frame = encode_rendered_frame(rendered)
        if full_frame:
            state.full_frame = state.frame
        else:
            full_rendered = render_device_view(
                device_id=state.device_id,
                button_count=state.button_count,
                frame_id=state.frame_id,
                base_frame_id=0,
                full_frame=True,
            )
            state.full_frame = encode_rendered_frame(full_rendered)


def encode_rendered_frame(frame: RenderedFrame) -> bytes:
    return encode_frame(
        frame_id=frame.frame_id,
        base_frame_id=frame.base_frame_id,
        width=SCREEN_WIDTH,
        height=SCREEN_HEIGHT,
        rects=frame.rects,
        full_frame=frame.full_frame,
    )
