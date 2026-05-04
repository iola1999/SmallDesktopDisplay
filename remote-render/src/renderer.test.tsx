import {describe, expect, test} from "vitest";

import {DeviceUiState, FONT_MAPLE_MONO_NF_CN, FONT_WENKAI_SCREEN} from "./ui-state.js";
import {
  SCREEN_HEIGHT,
  SCREEN_WIDTH,
  buildClockFlipGlyphs,
  buildHomeCopy,
  computeDirtyRects,
  renderDeviceCanvas,
  renderDeviceView,
} from "./renderer/index.js";
import {decodeRgb565Rle, ENCODING_RGB565_RLE} from "./protocol.js";

describe("React remote renderer", () => {
  test("uses Chinese date, weekday, time, and greeting copy", () => {
    const copy = buildHomeCopy(new Date("2026-05-01T06:32:08.000+08:00"));

    expect(copy.dateText).toBe("五月一日");
    expect(copy.weekdayText).toBe("星期五");
    expect(copy.timeText).toBe("06:32");
    expect(copy.secondsText).toBe(":08");
    expect(copy.greeting).toBe("早上好");
  });

  test("clock flip model animates hour, minute, and second digit changes", () => {
    const glyphs = buildClockFlipGlyphs(new Date("2026-05-01T13:00:00.100+08:00"), 300);

    const flippingGlyphs = glyphs.filter((glyph) => glyph.previousChar !== glyph.char);

    expect(flippingGlyphs.map((glyph) => glyph.group)).toEqual(expect.arrayContaining(["time", "seconds"]));
    expect(flippingGlyphs.map((glyph) => glyph.previousChar).join("")).toContain("2");
    expect(flippingGlyphs.map((glyph) => glyph.previousChar).join("")).toContain("5");
    expect(flippingGlyphs.map((glyph) => glyph.previousChar).join("")).toContain("9");
    expect(flippingGlyphs.every((glyph) => glyph.progress > 0 && glyph.progress < 1)).toBe(true);
  });

  test("renders a full-screen RGB565 frame from React host primitives", () => {
    const frame = renderDeviceView({
      deviceId: "desk-01",
      buttonCount: 0,
      now: new Date("2026-05-01T14:32:08.000+08:00"),
    });

    expect(frame.frameId).toBe(1);
    expect(frame.fullFrame).toBe(true);
    expect(frame.rects).toHaveLength(1);
    expect(frame.rects[0]).toMatchObject({x: 0, y: 0, width: SCREEN_WIDTH, height: SCREEN_HEIGHT});
    expect(frame.rects[0].encoding).toBe(ENCODING_RGB565_RLE);
    expect(decodeRgb565Rle(frame.rects[0].payload, SCREEN_WIDTH * SCREEN_HEIGHT)).toHaveLength(
      SCREEN_WIDTH * SCREEN_HEIGHT * 2,
    );
  });

  test("home canvas ignores device id, button count, and diagnostics footer state", () => {
    const state = new DeviceUiState();
    const diagnosed = new DeviceUiState();
    diagnosed.diagnostics.wifiRssi = -42;
    diagnosed.diagnostics.uptimeMs = 12_000;
    const now = new Date("2026-05-01T14:32:08.000+08:00");

    const first = renderDeviceCanvas({currentTime: now, deviceId: "desk-01", buttonCount: 0, uiState: state});
    const second = renderDeviceCanvas({currentTime: now, deviceId: "debug-device", buttonCount: 99, uiState: diagnosed});

    expect(Buffer.compare(first.rgba, second.rgba)).toBe(0);
  });

  test("second tick only emits a small dirty region", () => {
    const first = renderDeviceCanvas({
      currentTime: new Date("2026-05-01T12:34:56.000+08:00"),
      deviceId: "desk-01",
      buttonCount: 0,
    });
    const second = renderDeviceCanvas({
      currentTime: new Date("2026-05-01T12:34:57.000+08:00"),
      deviceId: "desk-01",
      buttonCount: 0,
    });

    const rects = computeDirtyRects(first, second);
    const payloadLength = rects.reduce((sum, rect) => sum + rect.payload.length, 0);

    expect(rects.length).toBeGreaterThan(0);
    expect(payloadLength).toBeLessThan(12_000);
  });

  test("settings entry animation changes intermediate frame only", () => {
    const now = new Date("2026-05-01T12:34:56.000+08:00");
    const start = renderDeviceCanvas({
      currentTime: now,
      deviceId: "desk-01",
      buttonCount: 0,
      uiState: new DeviceUiState({page: "settings", animation: "enter_settings"}),
      animationProgress: 0,
    });
    const staticFrame = renderDeviceCanvas({
      currentTime: now,
      deviceId: "desk-01",
      buttonCount: 0,
      uiState: new DeviceUiState({page: "settings"}),
      animationProgress: 1,
    });
    const end = renderDeviceCanvas({
      currentTime: now,
      deviceId: "desk-01",
      buttonCount: 0,
      uiState: new DeviceUiState({page: "settings", animation: "enter_settings"}),
      animationProgress: 1,
    });

    expect(Buffer.compare(start.rgba, staticFrame.rgba)).not.toBe(0);
    expect(Buffer.compare(end.rgba, staticFrame.rgba)).toBe(0);
  });

  test("font key changes the rendered text pixels", () => {
    const now = new Date("2026-05-01T12:34:56.000+08:00");
    const wenkai = renderDeviceCanvas({
      currentTime: now,
      deviceId: "desk-01",
      buttonCount: 0,
      uiState: new DeviceUiState({fontKey: FONT_WENKAI_SCREEN}),
    });
    const maple = renderDeviceCanvas({
      currentTime: now,
      deviceId: "desk-01",
      buttonCount: 0,
      uiState: new DeviceUiState({fontKey: FONT_MAPLE_MONO_NF_CN}),
    });

    expect(Buffer.compare(wenkai.rgba, maple.rgba)).not.toBe(0);
  });
});
