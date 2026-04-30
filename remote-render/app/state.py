from __future__ import annotations

import threading
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime
from zoneinfo import ZoneInfo

from PIL import Image

from app.protocol import encode_frame
from app.renderer import (
    FOOTER_REGION,
    TIME_REGION,
    RenderedFrame,
    SCREEN_HEIGHT,
    SCREEN_WIDTH,
    compute_dirty_rects,
    render_canvas_frame,
    render_device_canvas,
)
from app.ui_state import (
    DeviceCommand,
    DeviceUiState,
    apply_input_event,
    current_animation_progress,
    is_animation_active,
)


@dataclass
class QueuedCommand:
    id: int
    type: str
    value: int
    persist: bool = True


@dataclass
class DeviceState:
    device_id: str
    frame_id: int = 0
    button_count: int = 0
    last_input_seq: int = 0
    last_input_uptime_ms: int = -1
    last_render_second: int = -1
    last_animation_frame_at: float = -1.0
    frame: bytes = b""
    full_frame: bytes = b""
    latest_base_frame_id: int = 0
    latest_full_frame: bool = True
    canvas: Image.Image | None = None
    ui: DeviceUiState = field(default_factory=DeviceUiState)
    command_id: int = 0
    latest_command: QueuedCommand | None = None


class DeviceRegistry:
    def __init__(
        self,
        *,
        monotonic: Callable[[], float] = time.monotonic,
        frame_interval_seconds: float = 1.0,
        animation_frame_interval_seconds: float = 1.0 / 20.0,
    ) -> None:
        self._condition = threading.Condition()
        self._devices: dict[str, DeviceState] = {}
        self._monotonic = monotonic
        self._frame_interval_seconds = frame_interval_seconds
        self._animation_frame_interval_seconds = animation_frame_interval_seconds

    def get_frame(self, device_id: str, have: int, wait_ms: int) -> bytes | None:
        deadline = self._monotonic() + max(0, min(wait_ms, 5000)) / 1000.0
        with self._condition:
            state = self._ensure_device_locked(device_id)
            self._render_if_due_locked(state)
            frame = self._select_frame_for_client_locked(state, have)
            if frame is not None:
                return frame
            while state.frame_id <= have:
                remaining = deadline - self._monotonic()
                if remaining <= 0:
                    return None
                self._condition.wait(timeout=remaining)
                state = self._ensure_device_locked(device_id)
                self._render_if_due_locked(state)
                frame = self._select_frame_for_client_locked(state, have)
                if frame is not None:
                    return frame
            return self._select_frame_for_client_locked(state, have)

    def record_input(
        self,
        device_id: str,
        seq: int,
        event: str,
        uptime_ms: int = 0,
    ) -> bool:
        with self._condition:
            state = self._ensure_device_locked(device_id)
            if not self._should_accept_input_locked(state, seq, uptime_ms):
                return False

            previous_page = state.ui.page
            state.last_input_seq = seq
            state.last_input_uptime_ms = uptime_ms
            state.button_count += 1
            commands = apply_input_event(state.ui, event, now=self._monotonic())
            for command in commands:
                self._queue_command_locked(state, command)
            regions = [FOOTER_REGION] if previous_page == "home" and state.ui.page == "home" else None
            self._render_locked(state, full_frame=False, regions=regions)
            self._condition.notify_all()
            return True

    def get_command(self, device_id: str, after: int) -> QueuedCommand | None:
        with self._condition:
            state = self._ensure_device_locked(device_id)
            if state.latest_command is None or state.latest_command.id <= after:
                return None
            return state.latest_command

    def _ensure_device_locked(self, device_id: str) -> DeviceState:
        state = self._devices.get(device_id)
        if state is None:
            state = DeviceState(device_id=device_id)
            self._render_locked(state, full_frame=True)
            self._devices[device_id] = state
        return state

    def _render_if_due_locked(self, state: DeviceState) -> None:
        now = self._monotonic()
        if is_animation_active(state.ui, now=now):
            if (
                state.last_animation_frame_at < 0
                or now - state.last_animation_frame_at
                >= self._animation_frame_interval_seconds
            ):
                self._render_locked(state, full_frame=False)
            return

        if state.ui.animation:
            state.ui.animation = ""

        current_second = int(self._monotonic() / self._frame_interval_seconds)
        if current_second <= state.last_render_second:
            return

        self._render_locked(state, full_frame=False, regions=[TIME_REGION])

    def _select_frame_for_client_locked(self, state: DeviceState, have: int) -> bytes | None:
        if have == 0 or have > state.frame_id:
            return state.full_frame
        if state.frame_id <= have:
            return None
        if state.latest_full_frame or state.latest_base_frame_id == have:
            return state.frame
        return state.full_frame

    def _should_accept_input_locked(
        self,
        state: DeviceState,
        seq: int,
        uptime_ms: int,
    ) -> bool:
        if state.last_input_seq == 0:
            return True
        if seq > state.last_input_seq:
            return True
        return uptime_ms < state.last_input_uptime_ms

    def _render_locked(
        self,
        state: DeviceState,
        *,
        full_frame: bool,
        regions: list[tuple[int, int, int, int]] | None = None,
    ) -> None:
        now = self._monotonic()
        base_frame_id = state.frame_id
        state.frame_id += 1
        state.last_render_second = int(now / self._frame_interval_seconds)
        if is_animation_active(state.ui, now=now):
            state.last_animation_frame_at = now
        current_canvas = render_device_canvas(
            current_time=datetime.now(ZoneInfo("Asia/Shanghai")),
            device_id=state.device_id,
            button_count=state.button_count,
            ui_state=state.ui,
            animation_progress=current_animation_progress(state.ui, now=now),
        )
        if full_frame or state.canvas is None:
            rendered = render_canvas_frame(
                current_canvas,
                frame_id=state.frame_id,
                base_frame_id=0,
                full_frame=True,
            )
        else:
            rendered = RenderedFrame(
                frame_id=state.frame_id,
                base_frame_id=base_frame_id,
                full_frame=False,
                rects=compute_dirty_rects(state.canvas, current_canvas, regions=regions),
            )
        state.frame = encode_rendered_frame(rendered)
        state.latest_base_frame_id = rendered.base_frame_id
        state.latest_full_frame = rendered.full_frame
        _log_rendered_frame(state, rendered)
        state.canvas = current_canvas
        if full_frame:
            state.full_frame = state.frame
        else:
            full_rendered = render_canvas_frame(
                current_canvas,
                frame_id=state.frame_id,
                base_frame_id=0,
                full_frame=True,
            )
            state.full_frame = encode_rendered_frame(full_rendered)

    def _queue_command_locked(self, state: DeviceState, command: DeviceCommand) -> None:
        state.command_id += 1
        state.latest_command = QueuedCommand(
            id=state.command_id,
            type=command.type,
            value=command.value,
            persist=command.persist,
        )
        print(
            "[RemoteCommand] "
            f"device={state.device_id} id={state.command_id} "
            f"type={command.type} value={command.value} persist={command.persist}",
            flush=True,
        )


def encode_rendered_frame(frame: RenderedFrame) -> bytes:
    return encode_frame(
        frame_id=frame.frame_id,
        base_frame_id=frame.base_frame_id,
        width=SCREEN_WIDTH,
        height=SCREEN_HEIGHT,
        rects=frame.rects,
        full_frame=frame.full_frame,
    )


def _log_rendered_frame(state: DeviceState, frame: RenderedFrame) -> None:
    payload_len = sum(len(rect.payload) for rect in frame.rects)
    if not frame.full_frame and payload_len <= 12000 and len(frame.rects) <= 4:
        return

    print(
        "[RemoteFrame] "
        f"device={state.device_id} page={state.ui.page} "
        f"frame={frame.frame_id} base={frame.base_frame_id} "
        f"{'full' if frame.full_frame else 'partial'} "
        f"rects={len(frame.rects)} payload={payload_len}",
        flush=True,
    )
