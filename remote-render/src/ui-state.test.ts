import {describe, expect, test} from "vitest";

import {DeviceUiState, FONT_MAPLE_MONO_NF_CN, applyInputEvent, currentAnimationProgress} from "./ui-state.js";

describe("device UI state", () => {
  test("long press enters settings from home", () => {
    const state = new DeviceUiState();

    applyInputEvent(state, "long_press", 10);

    expect(state.page).toBe("settings");
    expect(state.selectedIndex).toBe(0);
    expect(state.animation).toBe("enter_settings");
    expect(currentAnimationProgress(state, 10)).toBe(0);
  });

  test("short press on home enters the game show at the first game", () => {
    const state = new DeviceUiState();

    const commands = applyInputEvent(state, "short_press", 10);

    expect(commands).toEqual([]);
    expect(state.page).toBe("game");
    expect(state.gameIndex).toBe(0);
  });

  test("short press in the game show advances to the next game", () => {
    const state = new DeviceUiState({page: "game", gameIndex: 0});

    applyInputEvent(state, "short_press", 10);
    expect(state.page).toBe("game");
    expect(state.gameIndex).toBe(1);

    applyInputEvent(state, "double_press", 20);
    expect(state.page).toBe("home");
  });

  test("brightness detail queues a set brightness command", () => {
    const state = new DeviceUiState({page: "detail", detailIndex: 0, pendingBrightness: 80});

    const commands = applyInputEvent(state, "long_press", 2);

    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({type: "set_brightness", value: 80, persist: true});
    expect(state.brightness).toBe(80);
    expect(state.animation).toBe("brightness_applied");
  });

  test("brightness detail short press applies the next value immediately", () => {
    const state = new DeviceUiState({page: "detail", detailIndex: 0, brightness: 50, pendingBrightness: 50});

    const commands = applyInputEvent(state, "short_press", 2);

    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({type: "set_brightness", value: 60, persist: true});
    expect(state.brightness).toBe(60);
    expect(state.pendingBrightness).toBe(60);
  });

  test("font detail short press applies the next font immediately", () => {
    const state = new DeviceUiState({page: "detail", detailIndex: 1});

    applyInputEvent(state, "short_press", 2);

    expect(state.fontKey).toBe(FONT_MAPLE_MONO_NF_CN);
    expect(state.pendingFontKey).toBe(FONT_MAPLE_MONO_NF_CN);
  });
});
