from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

PageName = Literal["home", "settings", "detail"]

SETTINGS_ITEMS = ("Brightness", "Theme", "Device", "Renderer", "About")


@dataclass
class DeviceUiState:
    page: PageName = "home"
    selected_index: int = 0
    detail_index: int = 0
    animation: str = ""
    animation_started_at: float = 0.0
    animation_duration: float = 0.22


def apply_input_event(state: DeviceUiState, event: str, *, now: float) -> None:
    if state.page == "home":
        if event == "long_press":
            state.page = "settings"
            state.selected_index = 0
            _start_animation(state, "enter_settings", now)
        elif event == "short_press":
            _start_animation(state, "home_tap", now)
        return

    if state.page == "settings":
        if event == "short_press":
            state.selected_index = (state.selected_index + 1) % len(SETTINGS_ITEMS)
            _start_animation(state, "settings_select", now)
        elif event == "long_press":
            state.page = "detail"
            state.detail_index = state.selected_index
            _start_animation(state, "enter_detail", now)
        elif event == "double_press":
            state.page = "home"
            _start_animation(state, "back_home", now)
        return

    if state.page == "detail":
        if event == "short_press":
            _start_animation(state, "detail_pulse", now)
        elif event in {"double_press", "long_press"}:
            state.page = "settings"
            _start_animation(state, "back_to_settings", now)


def current_animation_progress(state: DeviceUiState, *, now: float) -> float:
    if not state.animation:
        return 1.0
    elapsed = max(0.0, now - state.animation_started_at)
    if state.animation_duration <= 0:
        return 1.0
    return min(1.0, elapsed / state.animation_duration)


def is_animation_active(state: DeviceUiState, *, now: float) -> bool:
    return current_animation_progress(state, now=now) < 1.0


def ease_out_cubic(value: float) -> float:
    value = min(1.0, max(0.0, value))
    return 1.0 - pow(1.0 - value, 3)


def _start_animation(state: DeviceUiState, name: str, now: float) -> None:
    state.animation = name
    state.animation_started_at = now
