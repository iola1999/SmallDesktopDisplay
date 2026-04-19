# SmallDesktopDisplay ESP8266 UI Motion Upgrade Design

## Context

The current firmware already moved away from full-screen redraws in the settings flow and now supports targeted page-body redraws plus small transient overlays. That direction is correct for the current hardware.

The device is not an ESP32-class platform. It runs on ESP-12E / ESP8266 with a 240x240 ST7789 display through `TFT_eSPI` at `27MHz` SPI. The codebase also exposes real diagnostics for free heap, max free block, heap fragmentation, and flash usage. This means the UI refresh strategy must stay aligned with actual runtime memory pressure rather than aspirational desktop-style animation goals.

The user wants the interaction to feel more "alive" and elegant in the spirit of the fluid embedded UIs associated with Zhihuijun-inspired projects, but without copying those projects and without forcing effects that exceed the machine's budget.

## Problem

The current UI is functional and already avoids some unnecessary redraw work, but the motion language is still inconsistent:

- Menu selection changes are visually abrupt.
- Info-page scrolling and brightness adjustments update correctly but feel mechanical.
- Top transient feedback exists, but different transient elements still feel like separate one-off systems rather than a coherent interaction layer.
- The home page was rebalanced after the old animation was removed, but it still lacks a small amount of intentional motion that could make it feel more polished.

At the same time, the hardware budget is tight enough that the following are not viable design goals for this round:

- full-screen 60fps page transitions
- full-screen frame buffers
- background blur or alpha-composited overlays
- LVGL migration
- large bitmap frame animation

## Goals

- Make the UI feel more fluid and intentional on the existing ESP8266 hardware.
- Keep redraw cost low enough to remain stable under WiFi activity and normal background tasks.
- Reuse the existing `AppCore + RenderPlan + Screen + TftDisplayPort` architecture.
- Introduce a single, coherent motion system instead of adding page-specific animation hacks.
- Improve the interaction quality of menu, info, adjust, transient feedback, and home-page micro-interactions.

## Non-Goals

- Rebuild the UI stack around LVGL or another retained-mode GUI framework.
- Reintroduce large frame-based home animations.
- Match the visual complexity or frame rate of ESP32 / AT32 projects like Peak, Deck, or X-TRACK.
- Add touch-specific interaction design.
- Add remote rendering or image streaming in this round.

## Constraints

### Hardware

- MCU: ESP-12E / ESP8266
- Display: ST7789 240x240
- SPI frequency: `27MHz`
- Total RAM budget: nominally `80KB`, with practical free heap expected to be far lower at runtime
- Runtime tasks: WiFi, HTTP/weather refresh, setup portal, NTP, button input, display rendering

### Rendering

- A full-screen RGB565 buffer would require about `115200B`, which exceeds practical RAM capacity.
- Full-screen high-frequency animation is therefore off the table.
- Small strip or region buffers are acceptable only when bounded and optional.
- Existing incremental render planning must remain the default behavior.

### Codebase

- `src/app` should remain pure-C++ and platform-independent.
- Rendering behavior should stay in the existing display and screen layers.
- New motion state should not force view-model instability or broad architectural churn.

## Recommended Approach

Implement a lightweight motion system on top of the current rendering path, using target-following animation for a small set of UI properties rather than frame-by-frame scene rendering.

This should borrow the spirit of low-cost smooth embedded UI patterns seen in projects like WouoUI:

- each animated property keeps a current value and a target value
- updates are interruptible
- motion is driven by small numeric convergence, not heavyweight scene transitions
- only the regions that visually change are redrawn

This approach is the best fit because it preserves the existing firmware architecture, keeps RAM requirements bounded, and still allows the UI to feel significantly more refined.

## Alternatives Considered

### Option A: Minimal polish only

Add a few ad hoc easing effects directly to the existing menu, toast, and adjust-page drawing functions without introducing a shared motion model.

Trade-offs:

- Fastest to implement
- Lowest architectural change
- High risk of inconsistent behavior and duplicated logic
- Hard to extend across multiple pages

This is too short-sighted for the user's stated goal of improving the overall interaction feel.

### Option B: Lightweight shared motion layer

Add a compact motion-state model and use it to animate selection, scrolling, values, and transient elements while continuing to render with the existing imperative TFT code.

Trade-offs:

- Moderate implementation cost
- Fits ESP8266 constraints
- Produces consistent motion language
- Keeps architecture understandable

This is the recommended option.

### Option C: Full animated scene framework

Move toward LVGL-style or scene-graph-style transitions, with larger off-screen buffers and more aggressive page motion.

Trade-offs:

- Highest fidelity potential
- Highest implementation and verification cost
- Not compatible with current RAM and SPI limits
- High risk of flicker, stalls, and WiFi interaction regressions

This is not suitable for the current hardware target.

## Design

### Architecture

Add a thin motion layer that sits between the view model and final drawing, without changing the ownership boundaries of the current system.

The main responsibilities should be:

- `AppCore` continues to own semantic UI state and page content.
- `RenderPlan` continues to choose between full-screen and targeted redraw categories.
- A new motion-state component in the UI/rendering layer tracks current and target values for animateable properties.
- `Screen` remains responsible for actual primitives and sprite pushes.

This keeps application logic deterministic while allowing the display layer to interpolate presentation details over time.

## Motion Model

Each animated property should store:

- current value
- target value
- settled state

The first implementation should prefer integer or fixed-point state. Float usage is acceptable only if narrowly scoped and measured, but the default design should assume integer math is preferred on ESP8266.

The motion function should be interruptible:

- when the user changes selection again before the previous motion completes, the current value becomes the new starting point
- the property should continue converging naturally toward the latest target

The motion function should support a small number of tuning profiles rather than arbitrary per-call behavior:

- fast for transient feedback
- medium for selection and scroll
- slow for small home-page micro-motion

## Components

### 1. Shared UI Motion State

Introduce a small state container for animated presentation values, likely owned by the TFT display path rather than `AppCore`.

Initial properties to support:

- menu selection box y-position
- menu selection box width
- info-page scroll offset
- adjust-page numeric display easing
- adjust-page fill bar width
- toast vertical offset or scale surrogate
- gesture feedback capsule offset and lifetime
- small home-page card or badge offsets

This state should be reset when page structure changes in a way that invalidates interpolation.

### 2. Motion Tick Integration

Reuse the existing time-driven loop style rather than adding threads or independent schedulers.

Current periodic hooks already exist for:

- transient UI refresh
- clock refresh
- banner refresh

The design should add a motion tick that:

- runs at a small fixed interval similar to the transient UI tick
- only triggers redraw work when at least one property is not settled
- is scoped to the currently active page

### 3. Region-Aware Redraw

Animation must stay region-bound.

Expected redraw rules:

- menu and info motion redraw only page body regions
- adjust-page motion redraw only the adjust body
- top transient motion redraw only the top strip
- home-page micro-motion redraw only the card or label regions that move

Full-screen redraw remains allowed only when structure changes invalidate partial rendering.

## Page-by-Page Behavior

### Menu Page

Upgrade menu selection from hard switching to smooth target-following motion.

Behavior:

- selection box glides vertically to the next row
- selection width adapts smoothly to label length instead of snapping
- selection visual treatment remains simple and high contrast

This gives the largest perceived gain for the lowest rendering cost.

### Info Page / Diagnostics

Make row browsing feel less abrupt without turning it into inertial scrolling.

Behavior:

- row viewport offset transitions smoothly to the next target row position
- selected row emphasis follows the same motion profile as the viewport
- title chrome and footer remain static

This keeps the redraw region small and aligned with the existing `InfoBody` plan.

### Adjust Page

Make value changes and progress fill feel deliberate.

Behavior:

- large numeric value eases toward the new value
- fill bar width eases toward the target width
- no secondary decoration animation is included in the first implementation for this page

This page is naturally suited to animation because the changing geometry is already tightly bounded.

### Top Transient Feedback

Unify hold progress, gesture capsule, and toast-like feedback into a more coherent motion language.

Behavior:

- gesture capsule appears with a small offset/ease-in rather than immediate pop
- hold line uses smoother fill progression and cleaner settle/clear timing
- transient elements clear once per lifecycle, avoiding redundant strip wipes

This should remain visually subtle and cheap.

### Home Page

Only add low-cost micro-motion.

Behavior:

- weather panel may use a tiny entrance offset on page entry
- AQI badge and temperature/humidity bars may ease to updated values
- banner should use low-frequency, low-distance transitions only
- clock continues using glyph-only redraw rather than broad clears

No persistent high-frequency decorative animation should be introduced.

## Optional Strip Buffer

Do not make strip buffering part of the baseline design.

Instead:

- complete the no-buffer motion upgrade first
- only if hardware testing still shows visible flicker on body-region animation, evaluate a bounded strip buffer for a body region such as `240x24` or `240x32`
- gate the feature behind runtime safety assumptions validated with diagnostics

The strip buffer should not be generalized into a full-page abstraction in this round.

## Data Flow

1. `AppCore` emits the next semantic `AppViewModel`.
2. `RenderPlan` decides whether the change is full-screen or region-targeted.
3. Motion-state logic compares semantic state and updates animation targets.
4. A periodic motion tick advances current values toward targets.
5. The display layer redraws only the affected region when motion is active.
6. Once all relevant properties settle, redraw activity stops.

This preserves deterministic app state while allowing presentation smoothing.

## Error Handling

The motion layer must fail safely.

Rules:

- if motion state becomes inconsistent with the active page, reset it and draw the target state directly
- if a property target is invalid, clamp it and continue
- if runtime diagnostics suggest dangerously low free heap or fragmentation during future optional buffering work, buffering must stay disabled and direct drawing must remain the fallback
- user input must always win over animation; no motion path may block interaction handling

The UI should degrade to immediate updates rather than glitchy partial motion.

## Testing Strategy

### Host Tests

Add pure-C++ tests where possible for:

- motion convergence helpers
- interruptible target switching
- page-change reset behavior
- redraw-decision behavior where motion should remain region-bound

These tests should avoid direct Arduino/TFT dependencies.

### Embedded Verification

Manual validation on hardware is required for:

- menu selection smoothness
- diagnostics row browsing
- brightness adjust responsiveness
- top-strip transient behavior
- home-page update polish
- absence of obvious flicker during WiFi activity

Runtime diagnostics should be checked during motion-heavy interactions:

- free heap
- max free block
- heap fragmentation

### Regression Checks

Ensure the upgrade does not regress:

- setup and provisioning flow
- background weather refresh behavior
- page navigation correctness
- responsiveness under repeated button input

## Rollout Plan

Implement in phases:

1. Shared motion helpers and motion state
2. Menu and info-page motion
3. Adjust-page motion
4. Top transient feedback unification
5. Home-page micro-motion
6. Optional strip-buffer experiment only if hardware evidence justifies it

This sequencing delivers visible gains early and keeps the highest-risk optimization last.

## Acceptance Criteria

- Menu navigation feels visibly smoother without introducing full-screen redraws.
- Diagnostics/info browsing no longer appears to jump abruptly row-to-row.
- Brightness adjustment animates cleanly and remains responsive.
- Top-strip transient feedback feels consistent and does not erase unrelated visible elements.
- Home page gains subtle polish without persistent heavy animation.
- No new feature requires a full-screen buffer.
- The device remains responsive under normal WiFi and button activity.

## Open Decisions Resolved For This Design

To keep the scope clear, the following decisions are fixed for this round:

- Use the existing architecture rather than adopting LVGL.
- Prefer integer or fixed-point style motion helpers over broad float-heavy animation state.
- Do not include full-screen transitions.
- Treat strip buffering as optional follow-up work, not baseline scope.
- Prioritize `Menu -> Info -> Adjust -> Transient -> Home` in implementation order.

## Recommendation

Proceed with the lightweight shared motion layer and region-bound animation upgrade.

This design gives the product a clearly more elegant interaction feel while staying inside the memory, SPI, and rendering constraints of the current ESP8266 hardware.
