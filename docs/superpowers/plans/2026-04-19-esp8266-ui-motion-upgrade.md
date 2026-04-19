# ESP8266 UI Motion Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a lightweight shared motion layer to the ESP8266 UI so menu, info, adjust, transient, and home-page interactions feel more fluid without adding a full-screen buffer or changing the existing architecture.

**Architecture:** Keep `AppCore` and the semantic `AppViewModel` unchanged, add host-testable target-following helpers under `src/app`, and keep runtime motion state inside the TFT rendering path. Drive animation from a small periodic motion tick in `main.cpp`, update motion targets whenever `TftDisplayPort::render()` receives a new view, and redraw only the regions that already map to the existing `RenderPlan` structure or small home-page subregions.

**Tech Stack:** PlatformIO, ESP8266 Arduino core, doctest host tests, `TFT_eSPI`, `TJpg_Decoder`, existing `AppCore` / `RenderPlan` / `Screen` / `TftDisplayPort` architecture

---

## File Map

- Create: `src/app/UiMotion.h`
  Responsibility: pure C++ motion helpers and geometry/value target helpers that can be exercised in the host test environment.

- Create: `test/test_native_app_core/test_ui_motion.cpp`
  Responsibility: doctest coverage for interruptible motion convergence and the geometry/value helpers used by the rendering layer.

- Modify: `src/AppConfig.h`
  Responsibility: add a single motion tick interval constant used by `main.cpp`.

- Modify: `src/ui/TftDisplayPort.h`
- Modify: `src/ui/TftDisplayPort.cpp`
  Responsibility: add a motion tick entry point and update render flow so `Screen` receives both semantic renders and periodic motion refreshes.

- Modify: `src/Screen.h`
- Modify: `src/Screen.cpp`
  Responsibility: own runtime motion state, retarget it from semantic view changes, advance active motion values, and redraw only the affected regions.

- Modify: `src/main.cpp`
  Responsibility: schedule the new motion tick alongside the existing transient / clock / banner ticks.

- Modify: `src/app/TransientUi.h`
- Modify: `test/test_native_app_core/test_transient_ui.cpp`
  Responsibility: expose and test the small helper needed to map hold progress percent to a bounded fill width for the animated top strip.

- Modify: `docs/recent-iterations.md`
  Responsibility: record the motion-upgrade work and explicitly note that strip buffering remains a follow-up experiment rather than part of the baseline implementation.

### Task 1: Motion Helper And Geometry Coverage

**Files:**
- Create: `src/app/UiMotion.h`
- Create: `test/test_native_app_core/test_ui_motion.cpp`

- [ ] **Step 1: Write the failing test**

```cpp
#include <doctest.h>

#include "app/UiMotion.h"

TEST_CASE("motion values ease toward their targets and settle inside snap distance")
{
  app::MotionValue value;
  app::snapMotion(value, 120);
  app::retargetMotion(value, 180);

  CHECK(app::advanceMotion(value, 4, 1) == true);
  CHECK(value.current > 120);
  CHECK(value.current < 180);
  CHECK(value.settled == false);

  while (app::advanceMotion(value, 4, 1))
  {
  }

  CHECK(value.current == 180);
  CHECK(value.target == 180);
  CHECK(value.settled == true);
}

TEST_CASE("motion values can be retargeted while still in flight")
{
  app::MotionValue value;
  app::snapMotion(value, 0);
  app::retargetMotion(value, 100);
  REQUIRE(app::advanceMotion(value, 4, 1) == true);
  const int16_t inFlight = value.current;

  app::retargetMotion(value, 40);

  while (app::advanceMotion(value, 4, 1))
  {
  }

  CHECK(inFlight > 0);
  CHECK(value.current == 40);
  CHECK(value.target == 40);
  CHECK(value.settled == true);
}

TEST_CASE("ui motion geometry helpers stay aligned with the current layout")
{
  CHECK(app::menuBoxYForIndex(0) == 56);
  CHECK(app::menuBoxYForIndex(2) == 132);
  CHECK(app::infoScrollOffsetForFirstVisible(0) == 0);
  CHECK(app::infoScrollOffsetForFirstVisible(2) == 72);
  CHECK(app::infoSelectionBoxY(0, 0) == 52);
  CHECK(app::infoSelectionBoxY(1, 3) == 124);
  CHECK(app::adjustFillWidth(10, 10, 100, 192) == 0);
  CHECK(app::adjustFillWidth(55, 10, 100, 192) == 96);
  CHECK(app::adjustFillWidth(100, 10, 100, 192) == 192);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `~/.platformio/penv/bin/pio test -e host --without-uploading -f test_native_app_core --filter test_ui_motion`
Expected: FAIL because `UiMotion.h` and the helper APIs do not exist yet.

- [ ] **Step 3: Write minimal implementation**

```cpp
// src/app/UiMotion.h
#ifndef APP_UI_MOTION_H
#define APP_UI_MOTION_H

#include <cstdint>
#include <cstddef>

namespace app
{

struct MotionValue
{
  int16_t current = 0;
  int16_t target = 0;
  bool settled = true;
};

inline void snapMotion(MotionValue &value, int16_t target)
{
  value.current = target;
  value.target = target;
  value.settled = true;
}

inline void retargetMotion(MotionValue &value, int16_t target)
{
  value.target = target;
  value.settled = (value.current == target);
}

inline bool advanceMotion(MotionValue &value, uint8_t divisor, int16_t snapDistance)
{
  if (value.current == value.target)
  {
    value.settled = true;
    return false;
  }

  const int16_t delta = static_cast<int16_t>(value.target - value.current);
  const int16_t magnitude = delta >= 0 ? delta : static_cast<int16_t>(-delta);
  if (magnitude <= snapDistance)
  {
    value.current = value.target;
    value.settled = true;
    return true;
  }

  const int16_t step = static_cast<int16_t>(delta / static_cast<int16_t>(divisor > 0 ? divisor : 1));
  value.current = static_cast<int16_t>(value.current + (step == 0 ? (delta > 0 ? 1 : -1) : step));
  value.settled = (value.current == value.target);
  return true;
}

inline int16_t menuBoxYForIndex(std::size_t index) { return static_cast<int16_t>(56 + (index * 38)); }
inline int16_t infoScrollOffsetForFirstVisible(std::size_t firstVisible) { return static_cast<int16_t>(firstVisible * 36); }
inline int16_t infoSelectionBoxY(std::size_t firstVisible, std::size_t selected)
{
  const int32_t signedIndex = static_cast<int32_t>(selected) - static_cast<int32_t>(firstVisible);
  return static_cast<int16_t>(52 + (signedIndex * 36));
}
inline int16_t adjustFillWidth(int value, int minValue, int maxValue, int totalWidth);

} // namespace app

#endif // APP_UI_MOTION_H
```

Implement `adjustFillWidth` inline in the same header with clamping for:
- `value < minValue`
- `value > maxValue`
- `maxValue <= minValue`

Do not add any Arduino or TFT dependency to this file.

- [ ] **Step 4: Run test to verify it passes**

Run: `~/.platformio/penv/bin/pio test -e host --without-uploading -f test_native_app_core --filter test_ui_motion`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/UiMotion.h test/test_native_app_core/test_ui_motion.cpp
git commit -m "test: add ui motion helper coverage"
```

### Task 2: Motion Tick Plumbing And Screen Entry Points

**Files:**
- Modify: `src/AppConfig.h`
- Modify: `src/ui/TftDisplayPort.h`
- Modify: `src/ui/TftDisplayPort.cpp`
- Modify: `src/Screen.h`
- Modify: `src/Screen.cpp`
- Modify: `src/main.cpp`

- [ ] **Step 1: Write the failing test**

Use the Task 1 host tests as the red proof for the new helper layer, then use the firmware build as the failing proof for the new tick plumbing because the display-side wiring is embedded-only.

- [ ] **Step 2: Run test to verify it fails**

Run: `~/.platformio/penv/bin/pio run -e esp12e`
Expected: FAIL once you add the new `tickMotion` and `refreshMotion` declarations but before their implementations exist.

- [ ] **Step 3: Write minimal implementation**

Add a single motion tick constant:

```cpp
// src/AppConfig.h
constexpr uint32_t kUiMotionTickMs = 16;
```

Add the display-port entry point:

```cpp
// src/ui/TftDisplayPort.h
void tickMotion(const app::AppViewModel &view, uint32_t nowMs);
```

```cpp
// src/ui/TftDisplayPort.cpp
void TftDisplayPort::tickMotion(const app::AppViewModel &view, uint32_t nowMs)
{
  if (view.kind != app::ViewKind::Main)
  {
    return;
  }

  screen::refreshMotion(view.main, nowMs);
}
```

Expose the new screen hooks:

```cpp
// src/Screen.h
void syncMotionTargets(const app::MainViewData &view, app::RenderRegion region);
void refreshMotion(const app::MainViewData &view, uint32_t nowMs);
```

Wire them in with a no-op implementation first so the build compiles before the real motion work lands:

```cpp
// src/Screen.cpp
void syncMotionTargets(const app::MainViewData &, app::RenderRegion) {}

void refreshMotion(const app::MainViewData &, uint32_t) {}
```

Update `TftDisplayPort::render()` so every semantic render publishes fresh motion targets before drawing:

```cpp
if (view.kind == app::ViewKind::Main)
{
  screen::syncMotionTargets(view.main, plan.region);
}
```

Drive the tick from `main.cpp`:

```cpp
uint32_t g_lastUiMotionTickMs = 0;

if (nowMs - g_lastUiMotionTickMs >= app_config::kUiMotionTickMs)
{
  g_lastUiMotionTickMs = nowMs;
  g_display.tickMotion(g_core.view(), nowMs);
}
```

- [ ] **Step 4: Run verification**

Run: `~/.platformio/penv/bin/pio run -e esp12e -t clean`
Expected: SUCCESS

Run: `~/.platformio/penv/bin/pio run -e esp12e`
Expected: PASS with the motion tick path compiled but behavior still unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/AppConfig.h src/ui/TftDisplayPort.h src/ui/TftDisplayPort.cpp src/Screen.h src/Screen.cpp src/main.cpp
git commit -m "refactor: add ui motion tick plumbing"
```

### Task 3: Menu And Info Body Motion

**Files:**
- Modify: `src/Screen.cpp`
- Modify: `src/Screen.h`

- [ ] **Step 1: Write the failing test**

No new host-side rendering test is required here. The red signal is the lack of behavior in `screen::syncMotionTargets()` / `screen::refreshMotion()` plus manual validation that menu and info bodies still jump immediately.

- [ ] **Step 2: Run test to verify it fails**

Run: `~/.platformio/penv/bin/pio run -e esp12e`
Expected: PASS build, but menu selection and diagnostics row movement still render as abrupt snaps because the motion hooks are no-ops.

- [ ] **Step 3: Write minimal implementation**

Add compact runtime state near the top of `src/Screen.cpp`:

```cpp
struct MenuMotionState
{
  app::MotionValue boxY;
  app::MotionValue boxWidth;
  std::size_t selectedIndex = 0;
  bool active = false;
};

struct InfoMotionState
{
  app::MotionValue scrollOffset;
  app::MotionValue selectionY;
  std::size_t selectedIndex = 0;
  bool active = false;
};

MenuMotionState s_menuMotion;
InfoMotionState s_infoMotion;
app::OperationalPageKind s_motionPageKind = app::OperationalPageKind::Home;
```

Add helpers:

```cpp
std::size_t selectedMenuIndex(const app::MenuBodyData &menu);
int16_t menuSelectionWidth(const app::MenuBodyData &menu, std::size_t index);
void syncMenuMotion(const app::MenuBodyData &menu, bool snap);
void syncInfoMotion(const app::InfoBodyData &info, bool snap);
bool tickMenuMotion(const app::MenuBodyData &menu);
bool tickInfoMotion(const app::InfoBodyData &info);
void drawMenuItemsBase(const app::MenuBodyData &menu);
void drawAnimatedMenuSelection(const app::MenuBodyData &menu);
void drawAnimatedInfoRows(const app::InfoBodyData &info);
```

Implement these rules exactly:
- `syncMotionTargets()` snaps all motion values when the page kind changes or when a full-screen render is required.
- Menu body motion only animates one highlight capsule:
  - base rows draw unselected
  - the selected label is re-drawn inside the moving highlight
  - width target comes from `display::tft.textWidth(label.c_str(), 2) + 24`, clamped to the 208-pixel row width
- Info body motion uses:
  - `scrollOffset = firstVisibleRowIndex * 36`
  - `selectionY = 52 + ((static_cast<int32_t>(selectedRowIndex) - static_cast<int32_t>(firstVisibleRowIndex)) * 36)`
  - row drawing from absolute pixel offset so rows visibly glide rather than re-layout row-by-row
- `refreshMotion()` only redraws:
  - `RenderRegion::MenuBody` when menu motion is active
  - `RenderRegion::InfoBody` when info motion is active

Use the existing clear helpers rather than adding a full-screen clear anywhere in this task.

- [ ] **Step 4: Run verification**

Run: `~/.platformio/penv/bin/pio run -e esp12e`
Expected: PASS

Manual verification:
1. Long-press into Settings and short-press through menu items.
2. Confirm the highlight glides instead of snapping.
3. Open Diagnostics and short-press to browse.
4. Confirm visible rows move smoothly within the body while title and footer stay static.

- [ ] **Step 5: Commit**

```bash
git add src/Screen.h src/Screen.cpp
git commit -m "feat: animate menu and diagnostics body motion"
```

### Task 4: Adjust Page And Top-Strip Motion

**Files:**
- Modify: `src/app/TransientUi.h`
- Modify: `test/test_native_app_core/test_transient_ui.cpp`
- Modify: `src/Screen.cpp`

- [ ] **Step 1: Write the failing test**

```cpp
TEST_CASE("hold feedback fill width scales with the available strip width")
{
  CHECK(app::holdFeedbackFillWidth(0, 212) == 0);
  CHECK(app::holdFeedbackFillWidth(50, 212) == 106);
  CHECK(app::holdFeedbackFillWidth(100, 212) == 212);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `~/.platformio/penv/bin/pio test -e host --without-uploading -f test_native_app_core --filter test_transient_ui`
Expected: FAIL because `holdFeedbackFillWidth()` does not exist yet.

- [ ] **Step 3: Write minimal implementation**

Add the helper:

```cpp
// src/app/TransientUi.h
inline int16_t holdFeedbackFillWidth(uint8_t progressPercent, int16_t totalWidth)
{
  if (progressPercent >= 100)
  {
    return totalWidth;
  }

  return static_cast<int16_t>((static_cast<int32_t>(totalWidth) * progressPercent) / 100);
}
```

Add screen-side motion state:

```cpp
struct AdjustMotionState
{
  app::MotionValue displayValue;
  app::MotionValue fillWidth;
  bool active = false;
};

struct TransientMotionState
{
  app::MotionValue gestureOffsetY;
  app::MotionValue holdFillWidth;
};

AdjustMotionState s_adjustMotion;
TransientMotionState s_transientMotion;
```

Implement these rules in `src/Screen.cpp`:
- Adjust page:
  - retarget displayed value to `adjust.value`
  - retarget fill width with `app::adjustFillWidth(adjust.value, adjust.minValue, adjust.maxValue, 192)`
  - draw `s_adjustMotion.displayValue.current` and `s_adjustMotion.fillWidth.current`
  - only redraw `AdjustBody`
- Hold line:
  - compute progress with the existing `holdFeedbackProgressPercent()`
  - convert progress to target pixels with `holdFeedbackFillWidth(progressPercent, kHoldLineWidth)`
  - animate `s_transientMotion.holdFillWidth` toward that target
- Gesture feedback:
  - on `showGestureFeedback()`, snap the capsule offset to `-4`, retarget it to `0`, and mark it dirty
  - on `refreshGestureFeedback()`, draw the capsule at `kGestureFeedbackY + s_transientMotion.gestureOffsetY.current`
  - while visible, `refreshMotion()` continues to redraw only the top strip until the offset settles or the visibility window expires

- [ ] **Step 4: Run verification**

Run: `~/.platformio/penv/bin/pio test -e host --without-uploading -f test_native_app_core --filter test_transient_ui`
Expected: PASS

Run: `~/.platformio/penv/bin/pio run -e esp12e`
Expected: PASS

Manual verification:
1. Open Brightness and short-press through presets.
2. Confirm the large number and fill bar ease rather than snap.
3. On Home and Settings, trigger tap / hold / back feedback.
4. Confirm the top capsule enters cleanly and the hold strip fills smoothly without erasing unrelated visible content.

- [ ] **Step 5: Commit**

```bash
git add src/app/TransientUi.h test/test_native_app_core/test_transient_ui.cpp src/Screen.cpp
git commit -m "feat: animate adjust page and transient feedback"
```

### Task 5: Home-Page Micro-Motion, Docs, And Final Verification

**Files:**
- Modify: `src/Screen.cpp`
- Modify: `docs/recent-iterations.md`

- [ ] **Step 1: Write the failing test**

No meaningful host-side rendering test exists for the home TFT composition. Use explicit build verification and hardware review for this task.

- [ ] **Step 2: Run test to verify it fails**

Run: `~/.platformio/penv/bin/pio run -e esp12e`
Expected: PASS build, but the home page still updates without the intended micro-motion because only menu, info, adjust, and transient regions are animated so far.

- [ ] **Step 3: Write minimal implementation**

Add small home-only motion state:

```cpp
struct HomeMotionState
{
  app::MotionValue weatherPanelOffsetX;
  app::MotionValue aqiOffsetY;
  app::MotionValue tempBarWidth;
  app::MotionValue humidityBarWidth;
  bool initialized = false;
};

HomeMotionState s_homeMotion;
```

Update `src/Screen.cpp` so:
- entering `OperationalPageKind::Home` snaps the current page state if it is the first home render after another page
- the weather panel is drawn at `panelX + s_homeMotion.weatherPanelOffsetX.current`, starting from a small positive offset and settling at `0`
- AQI badge y-position uses `16 + s_homeMotion.aqiOffsetY.current`
- temperature and humidity bars use animated widths from `s_homeMotion.tempBarWidth.current` / `s_homeMotion.humidityBarWidth.current`
- `refreshMotion()` redraws only the AQI/weather/bars subregions on Home, not the whole screen

Update `docs/recent-iterations.md` with:

```md
### 2026-04-19 UI Motion Upgrade

- Added a lightweight shared motion layer for menu, diagnostics, adjust-page, transient, and home-page micro-interactions.
- Kept the implementation on the existing ESP8266 TFT path without introducing a full-screen frame buffer or LVGL.
- Left strip buffering as a follow-up experiment only if hardware still shows visible flicker after the no-buffer motion pass.
```

- [ ] **Step 4: Run verification**

Run: `~/.platformio/penv/bin/pio test -e host --without-uploading -f test_native_app_core`
Expected: PASS

Run: `~/.platformio/penv/bin/pio run -e esp12e -t clean`
Expected: SUCCESS

Run: `~/.platformio/penv/bin/pio run -e esp12e`
Expected: PASS

Manual verification checklist:
1. Boot to Home and confirm the weather card settles into place once.
2. Wait for a weather update or force one and confirm AQI / temp / humidity changes ease cleanly.
3. Move from Home to Settings and back; confirm motion state resets correctly and does not leak across pages.
4. Confirm no new full-screen clears were added to hot interaction paths.
5. Open Diagnostics and note `free heap`, `max free block`, and `heap fragmentation` during interaction to confirm no obvious regression.

- [ ] **Step 5: Commit**

```bash
git add src/Screen.cpp docs/recent-iterations.md
git commit -m "feat: add home page micro-motion polish"
```
