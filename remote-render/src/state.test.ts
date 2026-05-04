import {describe, expect, test} from "vitest";

import {applyFrameToRgba, decodeFrame} from "./tools/frame-preview.js";
import {DeviceRegistry} from "./state.js";
import {HOME_GAME_REGION} from "./renderer/index.js";

describe("device registry", () => {
  test("returns latest frame then no content for same frame id", async () => {
    const registry = new DeviceRegistry();

    const first = await registry.getFrame("desk-01", 0, 0);
    expect(first).not.toBeNull();
    const frameId = first!.readUInt32LE(8);

    const second = await registry.getFrame("desk-01", frameId, 1);
    expect(second).toBeNull();
  });

  test("short press on home switches the ambient game and sends the full game region", async () => {
    const registry = new DeviceRegistry();

    const first = await registry.getFrame("desk-02", 0, 0);
    const frameId = first!.readUInt32LE(8);
    const initialGame = registry.devices.get("desk-02")!.homeGame!.kind;

    expect(registry.recordInput("desk-02", 1, "short_press", 1000)).toBe(true);

    const switched = await registry.getFrame("desk-02", frameId, 1);
    const decoded = decodeFrame(switched!);

    expect(registry.devices.get("desk-02")!.homeGame!.kind).not.toBe(initialGame);
    expect(decoded.fullFrame).toBe(false);
    expect(decoded.rects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({x: HOME_GAME_REGION[0], y: HOME_GAME_REGION[1], width: HOME_GAME_REGION[2] - HOME_GAME_REGION[0], height: HOME_GAME_REGION[3] - HOME_GAME_REGION[1]}),
      ]),
    );
  });

  test("double press on home forces a full refresh frame", async () => {
    const registry = new DeviceRegistry();
    const deviceId = "desk-home-refresh";

    const first = await registry.getFrame(deviceId, 0, 0);
    const frameId = first!.readUInt32LE(8);

    expect(registry.recordInput(deviceId, 1, "double_press", 1000)).toBe(true);

    const refresh = await registry.getFrame(deviceId, frameId, 1);
    const decoded = decodeFrame(refresh!);

    expect(decoded.fullFrame).toBe(true);
    expect(decoded.rects).toHaveLength(1);
    expect(decoded.rects[0]).toMatchObject({x: 0, y: 0, width: 240, height: 240});
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

  test("emits a final clock flip cleanup frame after the animation window", async () => {
    let now = 0;
    const baseTime = new Date("2026-05-01T12:59:59.000+08:00").getTime();
    const registry = new DeviceRegistry({
      monotonic: () => now,
      now: () => new Date(baseTime + now * 1000),
      frameIntervalSeconds: 1,
      animationFrameIntervalSeconds: 0.05,
      clockFlipAnimationSeconds: 0.3,
    });
    const deviceId = "desk-clock-final";

    const first = await registry.getFrame(deviceId, 0, 0);
    let rgba = applyFrameToRgba(Buffer.alloc(0), 240, decodeFrame(first!));
    let have = first!.readUInt32LE(8);

    now = 1;
    const startFlip = await registry.getFrame(deviceId, have, 0);
    rgba = applyFrameToRgba(rgba, 240, decodeFrame(startFlip!));
    have = startFlip!.readUInt32LE(8);

    now = 1.1;
    const midFlip = await registry.getFrame(deviceId, have, 0);
    rgba = applyFrameToRgba(rgba, 240, decodeFrame(midFlip!));
    have = midFlip!.readUInt32LE(8);

    now = 1.31;
    const cleanup = await registry.getFrame(deviceId, have, 0);
    const decoded = decodeFrame(cleanup!);
    rgba = applyFrameToRgba(rgba, 240, decoded);
    const fullSnapshot = applyFrameToRgba(Buffer.alloc(0), 240, decodeFrame(registry.devices.get(deviceId)!.fullFrame));

    expect(decoded.fullFrame).toBe(false);
    expect(decoded.rects.length).toBeGreaterThan(0);
    expect(Buffer.compare(rgba, fullSnapshot)).toBe(0);
  });

  test("emits slower home game frames after clock cleanup", async () => {
    let now = 0;
    const baseTime = new Date("2026-05-01T12:34:56.000+08:00").getTime();
    const registry = new DeviceRegistry({
      monotonic: () => now,
      now: () => new Date(baseTime + now * 1000),
      frameIntervalSeconds: 1,
      animationFrameIntervalSeconds: 0.05,
      clockFlipAnimationSeconds: 0.3,
      homeGameFrameIntervalSeconds: 1,
    });
    const deviceId = "desk-snake-live";

    const first = await registry.getFrame(deviceId, 0, 0);
    const firstFrameId = first!.readUInt32LE(8);

    now = 0.5;
    await expect(registry.getFrame(deviceId, firstFrameId, 0)).resolves.toBeNull();

    now = 1;
    const gameFrame = await registry.getFrame(deviceId, firstFrameId, 0);
    const gameDecoded = decodeFrame(gameFrame!);
    let have = gameFrame!.readUInt32LE(8);

    expect(gameDecoded.fullFrame).toBe(false);
    expect(gameDecoded.rects.length).toBeGreaterThan(0);
    expect(gameDecoded.rects.some((rect) => rect.y >= 136 && rect.y < 226)).toBe(true);

    now = 1.31;
    const cleanupFrame = await registry.getFrame(deviceId, have, 0);
    have = cleanupFrame!.readUInt32LE(8);

    now = 1.5;
    await expect(registry.getFrame(deviceId, have, 0)).resolves.toBeNull();
  });

  test("sends the full game region when the home game times out and switches", async () => {
    let now = 0;
    const baseTime = new Date("2026-05-01T12:09:59.000+08:00").getTime();
    const registry = new DeviceRegistry({
      monotonic: () => now,
      now: () => new Date(baseTime + now * 1000),
      frameIntervalSeconds: 1,
      animationFrameIntervalSeconds: 0.05,
      clockFlipAnimationSeconds: 0.3,
      homeGameFrameIntervalSeconds: 1,
    });
    const deviceId = "desk-game-switch-clear";

    const first = await registry.getFrame(deviceId, 0, 0);
    let rgba = applyFrameToRgba(Buffer.alloc(0), 240, decodeFrame(first!));
    let have = first!.readUInt32LE(8);
    const initialGame = registry.devices.get(deviceId)!.homeGame!.kind;

    now = 600;
    const switched = await registry.getFrame(deviceId, have, 0);
    const decoded = decodeFrame(switched!);
    rgba = applyFrameToRgba(rgba, 240, decoded);
    have = switched!.readUInt32LE(8);
    const fullSnapshot = applyFrameToRgba(Buffer.alloc(0), 240, decodeFrame(registry.devices.get(deviceId)!.fullFrame));
    const [left, top, right, bottom] = HOME_GAME_REGION;

    expect(registry.devices.get(deviceId)!.homeGame!.kind).not.toBe(initialGame);
    expect(decoded.fullFrame).toBe(false);
    expect(decoded.rects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({x: left, y: top, width: right - left, height: bottom - top}),
      ]),
    );
    expect(Buffer.compare(rgba, fullSnapshot)).toBe(0);
    expect(registry.devices.get(deviceId)!.latestBaseFrameId).toBe(have - 1);
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
