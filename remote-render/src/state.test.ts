import {describe, expect, test} from "vitest";

import {decodeFrame} from "./tools/frame-preview.js";
import {DeviceRegistry} from "./state.js";

describe("device registry", () => {
  test("returns latest frame then no content for same frame id", async () => {
    const registry = new DeviceRegistry();

    const first = await registry.getFrame("desk-01", 0, 0);
    expect(first).not.toBeNull();
    const frameId = first!.readUInt32LE(8);

    const second = await registry.getFrame("desk-01", frameId, 1);
    expect(second).toBeNull();
  });

  test("short press on home does not emit a new visual frame", async () => {
    const registry = new DeviceRegistry();

    const first = await registry.getFrame("desk-02", 0, 0);
    const frameId = first!.readUInt32LE(8);

    expect(registry.recordInput("desk-02", 1, "short_press", 1000)).toBe(true);

    await expect(registry.getFrame("desk-02", frameId, 1)).resolves.toBeNull();
  });

  test("returns full frame to cold clients after a partial tick update", async () => {
    let now = 0;
    const registry = new DeviceRegistry({monotonic: () => now, frameIntervalSeconds: 1});

    const first = await registry.getFrame("desk-reboot", 0, 0);
    const frameId = first!.readUInt32LE(8);
    now = 1.1;
    const partial = await registry.getFrame("desk-reboot", frameId, 0);
    expect(partial![5] & 0x01).toBe(0);

    const cold = await registry.getFrame("desk-reboot", 0, 0);
    const decoded = decodeFrame(cold!);

    expect(decoded.fullFrame).toBe(true);
    expect(decoded.rects).toHaveLength(1);
    expect(decoded.rects[0]).toMatchObject({width: 240, height: 240});
  });

  test("emits a full final frame when a navigation animation expires between polls", async () => {
    let now = 0;
    const registry = new DeviceRegistry({monotonic: () => now, frameIntervalSeconds: 1});
    const deviceId = "desk-animation-final";

    const first = await registry.getFrame(deviceId, 0, 0);
    let have = first!.readUInt32LE(8);

    expect(registry.recordInput(deviceId, 1, "long_press", 100)).toBe(true);
    const enteringSettings = await registry.getFrame(deviceId, have, 0);
    have = enteringSettings!.readUInt32LE(8);

    now = 0.1;
    expect(registry.recordInput(deviceId, 2, "double_press", 200)).toBe(true);
    const returningHome = await registry.getFrame(deviceId, have, 0);
    have = returningHome!.readUInt32LE(8);

    now = 1.1;
    const settled = await registry.getFrame(deviceId, have, 0);
    const decoded = decodeFrame(settled!);

    expect(decoded.fullFrame).toBe(true);
    expect(decoded.rects).toHaveLength(1);
    expect(decoded.rects[0]).toMatchObject({x: 0, y: 0, width: 240, height: 240});
  });

  test("queues brightness command from detail confirm", async () => {
    const registry = new DeviceRegistry();
    const deviceId = "desk-brightness-command";

    await registry.getFrame(deviceId, 0, 0);
    expect(registry.recordInput(deviceId, 1, "long_press", 100)).toBe(true);
    expect(registry.recordInput(deviceId, 2, "long_press", 800)).toBe(true);
    expect(registry.recordInput(deviceId, 3, "short_press", 1200)).toBe(true);
    expect(registry.recordInput(deviceId, 4, "long_press", 1800)).toBe(true);

    expect(registry.getCommand(deviceId, 0)).toMatchObject({
      id: 1,
      type: "set_brightness",
      value: 60,
      persist: true,
    });
  });

  test("records client diagnostics from status sync", async () => {
    const registry = new DeviceRegistry();

    registry.recordStatus("desk-client-diagnostics", {
      brightness: 70,
      uptimeMs: 4321,
      heapFree: 34560,
      heapMaxBlock: 32000,
      heapFragmentation: 8,
      wifiRssi: -48,
    });

    const state = registry.devices.get("desk-client-diagnostics")!;
    expect(state.ui.diagnostics).toMatchObject({
      heapFree: 34560,
      heapMaxBlock: 32000,
      heapFragmentation: 8,
      wifiRssi: -48,
      uptimeMs: 4321,
    });
  });
});
