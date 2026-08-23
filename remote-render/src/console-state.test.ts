import {describe, expect, test} from "vitest";

import {createDefaultDeviceConfig} from "./config/schema.js";
import {DeviceRegistry} from "./state.js";

describe("console-facing device state", () => {
  test("preview access does not refresh the last real device communication time", async () => {
    let now = 0;
    const registry = new DeviceRegistry({monotonic: () => now});
    await registry.getFrame("desk-activity", 0, 0);

    now = 9;
    registry.getPreviewImage("desk-activity");

    expect(registry.listDevices()[0]).toMatchObject({
      deviceId: "desk-activity",
      lastCommunicationSeconds: 9,
      idleSeconds: 0,
      diagnostics: null,
    });
  });

  test("reports only diagnostics fields received from the device", async () => {
    const registry = new DeviceRegistry();
    await registry.getFrame("desk-status", 0, 0);
    expect(registry.listDevices()[0].diagnostics).toBeNull();

    registry.recordStatus("desk-status", {brightness: 20, uptimeMs: 0, wifiRssi: -61});

    expect(registry.listDevices()[0].diagnostics).toEqual({uptimeMs: 0, wifiRssi: -61});
  });

  test("draft preview for an offline id leaves the device map empty", () => {
    const registry = new DeviceRegistry();

    const image = registry.renderConfigPreview("desk-offline", createDefaultDeviceConfig());

    expect(image).toMatchObject({width: 240, height: 240});
    expect(registry.devices.size).toBe(0);
  });

  test("applying saved configuration updates and fully redraws an active device", async () => {
    const registry = new DeviceRegistry();
    await registry.getFrame("desk-apply", 0, 0);
    const state = registry.devices.get("desk-apply")!;
    const previousFrameId = state.frameId;
    const config = createDefaultDeviceConfig();
    config.appearance.themeKey = "amber";
    config.home.layout = "weather";
    config.home.header.showLunar = false;

    registry.applyDeviceConfig("desk-apply", config);

    expect(state.frameId).toBe(previousFrameId + 1);
    expect(state.latestFullFrame).toBe(true);
    expect(state.ui.themeKey).toBe("amber");
    expect(state.config.home).toEqual(config.home);
  });
});
