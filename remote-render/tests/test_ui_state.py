from app.ui_state import DeviceUiState, apply_input_event, current_animation_progress


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
