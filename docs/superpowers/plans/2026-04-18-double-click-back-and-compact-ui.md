# Double-Click Back And Compact UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add double-click back navigation, raise long-press confirmation to `500ms`, shrink the top chrome, and restore visible bottom guidance on non-home pages without regressing the existing single-button settings flow.

**Architecture:** Keep gesture semantics centralized in `src/app/AppCore.cpp` and `src/app/AppEvent.h`, keep physical button timing in `src/Input.cpp` / `src/AppConfig.h`, and keep top/bottom chrome rendering centralized in `src/Screen.cpp`. Host-side doctest coverage should prove behavior at the reducer/view-model layer, while `esp12e` compilation validates the embedded integration path.

**Tech Stack:** PlatformIO (`host`, `esp12e`), doctest, Arduino framework, Button2, existing `AppCore`/`Input`/`Screen` architecture

---

## Planned File Structure

- Modify: `src/AppConfig.h`
- Modify: `src/Input.h`
- Modify: `src/Input.cpp`
- Modify: `src/main.cpp`
- Modify: `src/app/AppEvent.h`
- Modify: `src/app/AppCore.cpp`
- Modify: `src/app/AppViewModel.h`
- Modify: `src/Screen.cpp`
- Modify: `test/test_native_app_core/test_settings_model_defaults.cpp`
- Modify: `test/test_native_app_core/test_settings_navigation.cpp`
- Modify: `test/test_native_app_core/test_brightness_adjust.cpp`

## Responsibility Map

- `src/AppConfig.h`: single source of truth for the new `500ms` long-press threshold.
- `src/Input.*` and `src/main.cpp`: wire Button2 double click into the firmware event queue and app event dispatch.
- `src/app/AppEvent.h`: add `DoublePressed` so the reducer can distinguish back navigation from short/long actions.
- `src/app/AppViewModel.h`: extend footer hints to include a double-click label.
- `src/app/AppCore.cpp`: encode the approved semantics: short = next/scroll, long = confirm, double = back, home double = no-op; compact the title model by clearing long subtitles and shortening footer tokens.
- `src/Screen.cpp`: shrink top chrome and render a low-profile but visible footer strip on non-home pages only.
- `test/test_native_app_core/*`: regression coverage for double-click routing, compact footer text, and the new timing constant/event contract.

## Build Strategy

- Fast loop: `~/.platformio/penv/bin/pio test -e host -f test_native_app_core`
- Embedded verification: `~/.platformio/penv/bin/pio run -e esp12e`
- Final proof before completion: run the full host test target again, then the `esp12e` build again.

---

### Task 1: Extend The Gesture Contract

**Files:**
- Modify: `src/AppConfig.h`
- Modify: `src/Input.h`
- Modify: `src/Input.cpp`
- Modify: `src/main.cpp`
- Modify: `src/app/AppEvent.h`
- Modify: `src/app/AppViewModel.h`
- Test: `test/test_native_app_core/test_settings_model_defaults.cpp`

- [ ] **Step 1: Write the failing contract tests**

```cpp
TEST_CASE("button interaction defaults include double-click hints and 500ms hold")
{
  app::AppViewModel view;

  CHECK(app_config::kButtonLongPressMs == 500);
  CHECK(view.main.footer.shortPressLabel == "");
  CHECK(view.main.footer.longPressLabel == "");
  CHECK(view.main.footer.doublePressLabel == "");
}

TEST_CASE("double-press event preserves monotonic timestamp")
{
  const auto event = app::AppEvent::doublePressed(1400);

  CHECK(event.type == app::AppEventType::DoublePressed);
  CHECK(event.monotonicMs == 1400);
}
```

- [ ] **Step 2: Run the host tests to verify the new contract is missing**

Run: `~/.platformio/penv/bin/pio test -e host -f test_native_app_core`

Expected: FAIL with errors such as `kButtonLongPressMs == 200`, `struct app::FooterHints has no member named doublePressLabel`, and `DoublePressed is not a member of app::AppEventType`.

- [ ] **Step 3: Implement the gesture contract**

```cpp
// src/AppConfig.h
constexpr uint32_t kButtonLongPressMs = 500;

// src/Input.h
enum class ButtonEvent
{
  None,
  PressStarted,
  LongPressArmed,
  PressReleased,
  ShortPress,
  DoublePress,
  LongPress,
};

// src/Input.cpp
void onDoubleClick(Button2 &)
{
  pushEvent(ButtonEvent::DoublePress);
}

void begin()
{
  s_button.setLongClickTime(app_config::kButtonLongPressMs);
  s_button.setDoubleClickHandler(onDoubleClick);
  ...
}

// src/main.cpp
case input::ButtonEvent::DoublePress:
  dispatch(g_core.handle(app::AppEvent::doublePressed(nowMs)));
  break;

// src/app/AppEvent.h
enum class AppEventType
{
  ...
  ShortPressed,
  DoublePressed,
  LongPressed,
  ...
};

static AppEvent doublePressed(uint32_t nowMs)
{
  AppEvent event;
  event.type = AppEventType::DoublePressed;
  event.monotonicMs = nowMs;
  return event;
}

// src/app/AppViewModel.h
struct FooterHints
{
  std::string shortPressLabel;
  std::string longPressLabel;
  std::string doublePressLabel;
};
```

- [ ] **Step 4: Re-run the host tests to verify the contract is green**

Run: `~/.platformio/penv/bin/pio test -e host -f test_native_app_core`

Expected: PASS for the new model/default tests, with remaining failures now isolated to route/view behavior that still needs implementation.

---

### Task 2: Implement Double-Click Back In The App Reducer

**Files:**
- Modify: `src/app/AppCore.cpp`
- Modify: `test/test_native_app_core/test_settings_navigation.cpp`
- Modify: `test/test_native_app_core/test_brightness_adjust.cpp`

- [ ] **Step 1: Write the failing navigation tests**

```cpp
TEST_CASE("double press returns from settings subpages but does nothing on home")
{
  auto core = operationalCore();

  const auto homeActions = core.handle(app::AppEvent::doublePressed(5000));
  CHECK(homeActions.count == 0);
  CHECK(core.ui().route == app::UiRoute::Home);

  core.handle(app::AppEvent::longPressed(5001));
  core.handle(app::AppEvent::doublePressed(5002));
  CHECK(core.ui().route == app::UiRoute::Home);
}

TEST_CASE("settings pages use compact footer tokens and empty subtitles")
{
  auto core = operationalCore();
  core.handle(app::AppEvent::longPressed(5000));

  CHECK(core.view().main.menu.subtitle == "");
  CHECK(core.view().main.footer.shortPressLabel == "Next");
  CHECK(core.view().main.footer.longPressLabel == "OK");
  CHECK(core.view().main.footer.doublePressLabel == "Back");
}

TEST_CASE("diagnostics double press returns to settings")
{
  auto core = operationalCore();
  core.handle(app::AppEvent::longPressed(5000));
  core.handle(app::AppEvent::longPressed(5001));
  core.handle(app::AppEvent::diagnosticsSnapshotCaptured(app::DiagnosticsSnapshot{}));

  const auto actions = core.handle(app::AppEvent::doublePressed(5002));
  CHECK(actions.count == 1);
  CHECK(actions[0].type == app::AppActionType::RenderRequested);
  CHECK(core.ui().route == app::UiRoute::SettingsMenu);
}
```

```cpp
TEST_CASE("double press leaves brightness page without saving")
{
  auto core = brightnessCore();
  enterBrightness(core);
  core.handle(app::AppEvent::shortPressed(1004));

  const auto actions = core.handle(app::AppEvent::doublePressed(1005));

  CHECK(actions.count == 1);
  CHECK(actions[0].type == app::AppActionType::RenderRequested);
  CHECK(core.ui().route == app::UiRoute::SettingsMenu);
  CHECK(core.config().lcdBrightness == 40);
}
```

- [ ] **Step 2: Run the host tests to watch the reducer fail**

Run: `~/.platformio/penv/bin/pio test -e host -f test_native_app_core`

Expected: FAIL because `AppCore::handle()` does not handle `DoublePressed`, diagnostics still advertises `Back` on long press, and menu/adjust subtitles still contain long helper strings.

- [ ] **Step 3: Implement the reducer/view-model changes**

```cpp
// src/app/AppCore.cpp
case UiRoute::SettingsMenu:
  view_.main.menu.subtitle.clear();
  view_.main.footer.shortPressLabel = "Next";
  view_.main.footer.longPressLabel = "OK";
  view_.main.footer.doublePressLabel = "Back";
  break;

case UiRoute::DiagnosticsPage:
  view_.main.info.subtitle.clear();
  view_.main.footer.shortPressLabel = "Scroll";
  view_.main.footer.longPressLabel = "OK";
  view_.main.footer.doublePressLabel = "Back";
  break;

case UiRoute::BrightnessAdjustPage:
  view_.main.adjust.subtitle.clear();
  view_.main.footer.shortPressLabel = "Next";
  view_.main.footer.longPressLabel = "Save";
  view_.main.footer.doublePressLabel = "Back";
  break;

case AppEventType::DoublePressed:
  if (runtime_.mode != AppMode::Operational)
  {
    break;
  }
  clearHoldFeedback();
  if (ui_.route == UiRoute::SettingsMenu)
  {
    ui_.route = UiRoute::Home;
    refreshOperationalView();
    actions.push(AppActionType::RenderRequested);
  }
  else if (ui_.route == UiRoute::DiagnosticsPage ||
           ui_.route == UiRoute::BrightnessAdjustPage ||
           ui_.route == UiRoute::RebootConfirmMenu)
  {
    openSettingsMenu();
    actions.push(AppActionType::RenderRequested);
  }
  break;
```

- [ ] **Step 4: Re-run the host tests to verify the reducer is green**

Run: `~/.platformio/penv/bin/pio test -e host -f test_native_app_core`

Expected: PASS for the new navigation tests, with only rendering/integration work left.

---

### Task 3: Compact The Top Chrome And Restore Visible Footer Guidance

**Files:**
- Modify: `src/Screen.cpp`
- Modify: `src/app/AppCore.cpp`

- [ ] **Step 1: Implement the compact chrome render path**

```cpp
// src/Screen.cpp
void drawFooterHints(const app::FooterHints &footer)
{
  if (footer.shortPressLabel.empty() &&
      footer.longPressLabel.empty() &&
      footer.doublePressLabel.empty())
  {
    return;
  }

  const int footerTop = 292;
  display::tft.fillRect(0, footerTop - 6, 240, 14, app_config::kColorBg);
  display::tft.drawFastHLine(8, footerTop - 3, 224, TFT_DARKGREY);
  display::tft.setTextDatum(MC_DATUM);
  display::tft.setTextColor(TFT_WHITE, app_config::kColorBg);
  display::tft.drawString(
    ("Tap " + footer.shortPressLabel + "  Hold " + footer.longPressLabel + "  2x " + footer.doublePressLabel).c_str(),
    120,
    footerTop + 4,
    1);
}

void drawPageChrome(const std::string &title, const app::FooterHints &footer)
{
  display::clear();
  display::tft.fillRoundRect(10, 10, 220, 26, 6, TFT_DARKGREY);
  display::tft.drawRoundRect(10, 10, 220, 26, 6, TFT_LIGHTGREY);
  display::tft.setTextDatum(TL_DATUM);
  display::tft.setTextColor(TFT_WHITE, TFT_DARKGREY);
  display::tft.drawString(title.c_str(), 18, 18, 2);
  drawFooterHints(footer);
}
```

- [ ] **Step 2: Run the embedded build**

Run: `~/.platformio/penv/bin/pio run -e esp12e`

Expected: PASS, proving the Button2 double-click wiring, `main.cpp` dispatch, and compact render path all compile for the device target.

- [ ] **Step 3: Run the final verification pass**

Run: `~/.platformio/penv/bin/pio test -e host -f test_native_app_core`

Expected: PASS

Run: `~/.platformio/penv/bin/pio run -e esp12e`

Expected: PASS
