from app.ui_state import (
    FONT_MAPLE_MONO_NF_CN,
    FONT_WENKAI_SCREEN,
    DeviceUiState,
    apply_input_event,
    current_animation_progress,
)


def test_long_press_enters_settings_from_home():
    state = DeviceUiState()

    apply_input_event(state, "long_press", now=10.0)

    assert state.page == "settings"
    assert state.selected_index == 0
    assert state.animation == "enter_settings"
    assert current_animation_progress(state, now=10.0) == 0.0


def test_settings_short_press_scrolls_selection():
    state = DeviceUiState(page="settings")

    apply_input_event(state, "short_press", now=1.0)

    assert state.selected_index == 1
    assert state.animation == "settings_select"


def test_settings_long_press_enters_detail_and_double_press_returns():
    state = DeviceUiState(page="settings", selected_index=2)

    apply_input_event(state, "long_press", now=1.0)

    assert state.page == "detail"
    assert state.detail_index == 2
    assert state.animation == "enter_detail"

    apply_input_event(state, "double_press", now=1.2)

    assert state.page == "settings"
    assert state.animation == "back_to_settings"


def test_double_press_returns_from_settings_to_home():
    state = DeviceUiState(page="settings", selected_index=1)

    apply_input_event(state, "double_press", now=2.0)

    assert state.page == "home"
    assert state.animation == "back_home"


def test_brightness_detail_short_press_cycles_pending_value():
    state = DeviceUiState(page="settings", selected_index=0)
    apply_input_event(state, "long_press", now=1.0)

    commands = apply_input_event(state, "short_press", now=1.1)

    assert commands == []
    assert state.page == "detail"
    assert state.detail_index == 0
    assert state.pending_brightness == 60
    assert state.animation == "brightness_adjust"


def test_brightness_detail_long_press_confirms_command():
    state = DeviceUiState(page="detail", detail_index=0, pending_brightness=80)

    commands = apply_input_event(state, "long_press", now=2.0)

    assert len(commands) == 1
    assert commands[0].type == "set_brightness"
    assert commands[0].value == 80
    assert commands[0].persist is True
    assert state.brightness == 80
    assert state.animation == "brightness_applied"


def test_font_detail_short_press_previews_next_font_and_long_press_applies():
    state = DeviceUiState(page="settings", selected_index=1)
    apply_input_event(state, "long_press", now=1.0)

    commands = apply_input_event(state, "short_press", now=1.1)

    assert commands == []
    assert state.page == "detail"
    assert state.detail_index == 1
    assert state.font_key == FONT_WENKAI_SCREEN
    assert state.pending_font_key == FONT_MAPLE_MONO_NF_CN
    assert state.animation == "font_select"

    commands = apply_input_event(state, "long_press", now=1.2)

    assert commands == []
    assert state.font_key == FONT_MAPLE_MONO_NF_CN
    assert state.animation == "font_applied"
