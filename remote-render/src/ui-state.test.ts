import {describe, expect, test} from "vitest";

import {DeviceUiState, applyInputEvent, currentAnimationProgress} from "./ui-state.js";

describe("device UI state", () => {
  test("long press enters settings from home", () => {
    const state = new DeviceUiState();

    applyInputEvent(state, "long_press", 10);

    expect(state.page).toBe("settings");
    expect(state.selectedIndex).toBe(0);
    expect(state.animation).toBe("enter_settings");
    expect(currentAnimationProgress(state, 10)).toBe(0);
  });

  test("short press on home has no visible state change", () => {
    const state = new DeviceUiState();

    const commands = applyInputEvent(state, "short_press", 10);

    expect(commands).toEqual([]);
    expect(state.page).toBe("home");
    expect(state.animation).toBe("");
  });

  test("brightness detail queues a set brightness command", () => {
    const state = new DeviceUiState({page: "detail", detailIndex: 0, pendingBrightness: 80});

    const commands = applyInputEvent(state, "long_press", 2);

    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({type: "set_brightness", value: 80, persist: true});
    expect(state.brightness).toBe(80);
    expect(state.animation).toBe("brightness_applied");
  });
});
