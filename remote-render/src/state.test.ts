import {describe, expect, test} from "vitest";

import {applyFrameToRgba, decodeFrame} from "./tools/frame-preview.js";
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

  test("short press on home is accepted but produces no page change", async () => {
    const registry = new DeviceRegistry();

    const first = await registry.getFrame("desk-02", 0, 0);
    const frameId = first!.readUInt32LE(8);

    expect(registry.recordInput("desk-02", 1, "short_press", 1000)).toBe(true);

    expect(registry.devices.get("desk-02")!.ui.page).toBe("home");
    // 无可见变化：同一秒内不应产生新帧
    const after = await registry.getFrame("desk-02", frameId, 0);
    expect(after).toBeNull();
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
    const baseTime = new Date("2026-05-01T12:00:00.000+08:00").getTime();
    const registry = new DeviceRegistry({
      monotonic: () => now,
      now: () => new Date(baseTime + now * 1000),
      frameIntervalSeconds: 1,
    });

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

  test("applies stored prefs to new devices and reports pref changes", async () => {
    const changes: Array<{deviceId: string; themeKey: string; fontKey: string}> = [];
    const registry = new DeviceRegistry({
      initialPrefs: {"desk-pref": {themeKey: "amber", fontKey: "noto_cjk"}},
      onPrefsChanged: (deviceId, prefs) => changes.push({deviceId, ...prefs}),
    });

    await registry.getFrame("desk-pref", 0, 0);
    expect(registry.devices.get("desk-pref")!.ui.themeKey).toBe("amber");
    expect(registry.devices.get("desk-pref")!.ui.fontKey).toBe("noto_cjk");

    registry.applyPrefs("desk-pref", {themeKey: "mono"});
    expect(registry.devices.get("desk-pref")!.ui.themeKey).toBe("mono");
    expect(registry.devices.get("desk-pref")!.ui.pendingThemeKey).toBe("mono");
    expect(changes).toEqual([{deviceId: "desk-pref", themeKey: "mono", fontKey: "noto_cjk"}]);

    // 亮度走命令通道，不进偏好回调
    registry.applyPrefs("desk-pref", {brightness: 80});
    expect(registry.getCommand("desk-pref", 0)).toMatchObject({type: "set_brightness", value: 80});
    expect(changes).toHaveLength(1);
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

  test("schedules a dedicated rain-step frame at +500ms after the flip window", async () => {
    let now = 0;
    const baseTime = new Date("2026-05-01T12:00:00.000+08:00").getTime();
    const registry = new DeviceRegistry({
      monotonic: () => now,
      now: () => new Date(baseTime + now * 1000),
      frameIntervalSeconds: 1,
    });
    const deviceId = "desk-rain-step";

    const first = await registry.getFrame(deviceId, 0, 0);
    let have = first!.readUInt32LE(8);

    // 秒初：翻牌起始帧
    now = 1.0;
    const flipStart = await registry.getFrame(deviceId, have, 0);
    expect(flipStart).not.toBeNull();
    have = flipStart!.readUInt32LE(8);

    // 翻牌窗结束（0.45s）后的清理帧，此时还没到雨滴跳变点
    now = 1.46;
    const cleanup = await registry.getFrame(deviceId, have, 0);
    expect(cleanup).not.toBeNull();
    have = cleanup!.readUInt32LE(8);

    // +500ms：雨滴 tick 跳变，调度器单独出一帧承载雨滴差分
    now = 1.51;
    const rainStep = await registry.getFrame(deviceId, have, 0);
    expect(rainStep).not.toBeNull();
    expect(rainStep![5] & 0x01).toBe(0); // partial
    have = rainStep!.readUInt32LE(8);

    // 同一秒内不再有第二个雨滴帧
    now = 1.7;
    expect(await registry.getFrame(deviceId, have, 0)).toBeNull();
  });

  test("cleanup frame past the rain offset absorbs the rain step without an extra frame", async () => {
    let now = 0;
    const baseTime = new Date("2026-05-01T12:00:00.000+08:00").getTime();
    const registry = new DeviceRegistry({
      monotonic: () => now,
      now: () => new Date(baseTime + now * 1000),
      frameIntervalSeconds: 1,
    });
    const deviceId = "desk-rain-late-cleanup";

    const first = await registry.getFrame(deviceId, 0, 0);
    let have = first!.readUInt32LE(8);

    now = 1.0;
    const flipStart = await registry.getFrame(deviceId, have, 0);
    have = flipStart!.readUInt32LE(8);

    // 设备迟到，清理帧在 0.5s 之后才被拉走：它顺带承载雨滴差分
    now = 1.6;
    const lateCleanup = await registry.getFrame(deviceId, have, 0);
    expect(lateCleanup).not.toBeNull();
    have = lateCleanup!.readUInt32LE(8);

    now = 1.8;
    expect(await registry.getFrame(deviceId, have, 0)).toBeNull();
  });

  test("status sync on home does not insert frames mid-animation", async () => {
    const registry = new DeviceRegistry();
    const deviceId = "desk-status-quiet";

    const first = await registry.getFrame(deviceId, 0, 0);
    const have = first!.readUInt32LE(8);

    registry.recordStatus(deviceId, {brightness: 90, uptimeMs: 1000});

    // 状态已入 ui，但首页不展示这些数字：不产生新帧
    expect(registry.devices.get(deviceId)!.ui.brightness).toBe(90);
    expect(await registry.getFrame(deviceId, have, 0)).toBeNull();
  });

  test("status sync still re-renders the Device diagnostics detail page", async () => {
    const registry = new DeviceRegistry();
    const deviceId = "desk-status-detail";

    const first = await registry.getFrame(deviceId, 0, 0);
    const have = first!.readUInt32LE(8);

    const state = registry.devices.get(deviceId)!;
    state.ui.page = "detail";
    state.ui.detailIndex = 2; // Device

    registry.recordStatus(deviceId, {brightness: 70, uptimeMs: 2000, heapFree: 30000});

    const updated = await registry.getFrame(deviceId, have, 0);
    expect(updated).not.toBeNull();
  });

  test("skipped frames get a catch-up partial against the device's canvas instead of a full resync", async () => {
    let now = 0;
    const baseTime = new Date("2026-05-01T12:00:00.000+08:00").getTime();
    const registry = new DeviceRegistry({
      monotonic: () => now,
      now: () => new Date(baseTime + now * 1000),
      frameIntervalSeconds: 1,
    });
    const deviceId = "desk-catch-up";

    const first = await registry.getFrame(deviceId, 0, 0);
    let rgba = applyFrameToRgba(Buffer.alloc(0), 240, decodeFrame(first!));
    const have = first!.readUInt32LE(8);

    // 设备错过两次渲染（例如详情页时 status 连续插帧）
    const state = registry.devices.get(deviceId)!;
    state.ui.page = "detail";
    state.ui.detailIndex = 2; // Device
    registry.recordStatus(deviceId, {brightness: 60, uptimeMs: 3000, heapFree: 11111});
    registry.recordStatus(deviceId, {brightness: 61, uptimeMs: 3100, heapFree: 22222});
    expect(state.latestBaseFrameId).not.toBe(have);

    const catchUp = await registry.getFrame(deviceId, have, 0);
    const decoded = decodeFrame(catchUp!);

    // 不再整屏回退：以设备已确认的帧为 base 的差分 partial
    expect(decoded.fullFrame).toBe(false);
    expect(decoded.baseFrameId).toBe(have);

    // 补差帧应用到设备画面后与服务端全屏快照逐像素一致
    rgba = applyFrameToRgba(rgba, 240, decoded);
    const fullSnapshot = applyFrameToRgba(Buffer.alloc(0), 240, decodeFrame(state.fullFrame));
    expect(Buffer.compare(rgba, fullSnapshot)).toBe(0);
  });

  test("console preview never advances the frame chain of an actively rendering device", async () => {
    let now = 0;
    const baseTime = new Date("2026-05-01T12:00:00.000+08:00").getTime();
    const registry = new DeviceRegistry({
      monotonic: () => now,
      now: () => new Date(baseTime + now * 1000),
      frameIntervalSeconds: 1,
    });
    const deviceId = "desk-preview-live";

    await registry.getFrame(deviceId, 0, 0);
    const state = registry.devices.get(deviceId)!;
    const frameId = state.frameId;

    // canvas 新鲜（设备刚拉过帧）：预览不插帧
    now = 0.5;
    registry.getPreviewImage(deviceId);
    expect(state.frameId).toBe(frameId);

    // 预览专用 id 场景：canvas 陈旧 ≥1s 时才代为渲染
    now = 2.5;
    registry.getPreviewImage(deviceId);
    expect(state.frameId).toBeGreaterThan(frameId);
  });

  test("frame result carries the latest command id for piggybacking", async () => {
    const registry = new DeviceRegistry();
    const deviceId = "desk-cmd-piggyback";

    const idle = await registry.getFrameWithStats(deviceId, 0, 0);
    expect(idle.commandId).toBe(0);

    registry.applyPrefs(deviceId, {brightness: 80});
    const after = await registry.getFrameWithStats(deviceId, 0, 0);
    expect(after.commandId).toBe(1);
  });

  test("clock flip window follows the wall clock even when monotonic phase is offset", async () => {
    // 进程单调秒与墙钟秒存在随机相位差 δ（这里模拟 δ=0.7）：
    // 秒窗口必须按墙钟推进，否则雨滴帧会把半翻状态定格半秒。
    let now = 0;
    const baseTime = new Date("2026-05-01T12:00:00.700+08:00").getTime();
    const registry = new DeviceRegistry({
      monotonic: () => now,
      now: () => new Date(baseTime + now * 1000),
      frameIntervalSeconds: 1,
    });
    const deviceId = "desk-wall-phase";

    const first = await registry.getFrame(deviceId, 0, 0);
    let have = first!.readUInt32LE(8);

    // 墙钟下一个整秒在单调 0.3 处：此时必须开始新一秒的渲染
    now = 0.35;
    const flipStart = await registry.getFrame(deviceId, have, 0);
    expect(flipStart).not.toBeNull();
    have = flipStart!.readUInt32LE(8);

    // 墙钟 x.5s（单调 0.8）：雨滴步进帧
    now = 0.82;
    const rainStep = await registry.getFrame(deviceId, have, 0);
    expect(rainStep).not.toBeNull();
    have = rainStep!.readUInt32LE(8);

    // 同一墙钟秒内不再有更多帧
    now = 0.95;
    expect(await registry.getFrame(deviceId, have, 0)).toBeNull();
  });

  test("evicts idle devices past the TTL while keeping active ones", async () => {
    let now = 0;
    const registry = new DeviceRegistry({
      monotonic: () => now,
      deviceIdleTtlSeconds: 100,
      evictionSweepIntervalSeconds: 10,
    });

    await registry.getFrame("idle-1", 0, 0);
    await registry.getFrame("idle-2", 0, 0);
    expect(registry.devices.size).toBe(2);

    now = 50;
    await registry.getFrame("active", 0, 0);
    expect(registry.devices.has("idle-1")).toBe(true);

    now = 200;
    await registry.getFrame("active", 0, 0);
    expect(registry.devices.has("idle-1")).toBe(false);
    expect(registry.devices.has("idle-2")).toBe(false);
    expect(registry.devices.has("active")).toBe(true);
  });
});
