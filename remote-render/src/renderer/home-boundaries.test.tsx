import {createCanvas} from "@napi-rs/canvas";
import {afterEach, describe, expect, test, vi} from "vitest";

import {createDefaultDeviceConfig, HOME_LAYOUT_OPTIONS} from "../config/schema.js";
import {DeviceUiState, FONT_OPTIONS, SETTINGS_ITEMS} from "../ui-state.js";
import {computeDirtyRects, FORECAST_REGION, HEADER_REGION, renderDeviceCanvas, TIME_REGION} from "./index.js";
import {buildDeviceViewModel} from "./services/view-model.js";
import {setWeatherSnapshotForTest} from "./services/weather.js";

afterEach(() => {
  vi.restoreAllMocks();
  setWeatherSnapshotForTest(null);
});

describe("home text boundaries", () => {
  test.each(FONT_OPTIONS)("keeps long dates and negative temperatures within their regions with %s", (fontKey) => {
    const context = createCanvas(1, 1).getContext("2d");
    const prototype = Object.getPrototypeOf(context) as typeof context;
    const originalFillText = prototype.fillText;
    const drawn: Array<{text: string; left: number; right: number; top: number; bottom: number}> = [];
    vi.spyOn(prototype, "fillText").mockImplementation(function (this: typeof context, text, x, y, maxWidth) {
      const metrics = this.measureText(text);
      drawn.push({
        text,
        left: x - metrics.actualBoundingBoxLeft,
        right: x + metrics.actualBoundingBoxRight,
        top: y - metrics.actualBoundingBoxAscent,
        bottom: y + metrics.actualBoundingBoxDescent,
      });
      originalFillText.call(this, text, x, y, maxWidth);
    });

    for (const date of ["2026-10-18", "2026-11-12"]) {
      const now = new Date(`${date}T12:34:56+08:00`);
      setWeatherSnapshotForTest({
        fetchedAtMs: now.getTime(),
        hours: [{time: `${date}T12:00`, temp: -10, code: 95, precip: 80}],
        days: [
          {date, code: 95, tempMax: -12, tempMin: -25, precip: 80},
          {date: new Date(now.getTime() + 86400_000).toISOString().slice(0, 10), code: 71, tempMax: -34, tempMin: -56, precip: 70},
          {date: new Date(now.getTime() + 2 * 86400_000).toISOString().slice(0, 10), code: 3, tempMax: -45, tempMin: -67, precip: 30},
        ],
      });
      for (const layout of HOME_LAYOUT_OPTIONS) {
        drawn.length = 0;
        const home = {...createDefaultDeviceConfig().home, layout};
        renderDeviceCanvas({currentTime: now, deviceId: "boundary", buttonCount: 0, uiState: new DeviceUiState({fontKey}), homeConfig: home, clockFlipProgress: 1});
        const header = drawn.filter((entry) => entry.text.includes("月"));
        expect(header).toHaveLength(2);
        const [dateText, lunarText] = header;
        const separate = dateText.right <= lunarText.left || dateText.bottom <= lunarText.top;
        expect(separate, `${date} / ${layout}: date and lunar text intersect`).toBe(true);

        const current = drawn.find((entry) => entry.text === "-10°")!;
        const label = drawn.find((entry) => entry.text === "雷阵雨")!;
        const high = drawn.find((entry) => entry.text === "-12°")!;
        const low = drawn.find((entry) => entry.text === "-25°")!;
        expect(current.right).toBeLessThan(label.left);
        expect(label.right).toBeLessThan(high.left);
        expect(high.right).toBeLessThan(low.left);
        const dailyHighs = ["-34°", "-45°"].map((text) => drawn.find((entry) => entry.text === text)!);
        const dailyLows = ["/-56°", "/-67°"].map((text) => drawn.find((entry) => entry.text === text)!);
        expect(dailyHighs[0].right).toBeLessThan(dailyLows[0].left);
        expect(dailyLows[0].right).toBeLessThan(dailyHighs[1].left);
        expect(dailyHighs[1].right).toBeLessThan(dailyLows[1].left);
        for (const entry of [...header, current, label, high, low, ...dailyHighs, ...dailyLows]) {
          expect(entry.left, entry.text).toBeGreaterThanOrEqual(0);
          expect(entry.right, entry.text).toBeLessThanOrEqual(240);
          expect(entry.top, entry.text).toBeGreaterThanOrEqual(0);
          expect(entry.bottom, entry.text).toBeLessThanOrEqual(240);
        }
      }
    }
  });
});

describe("home partial frame coverage", () => {
  test.each(FONT_OPTIONS)("updates every changed pixel across festival midnight boundaries with %s", (fontKey) => {
    for (const layout of HOME_LAYOUT_OPTIONS) {
      const home = {...createDefaultDeviceConfig().home, layout};
      for (const previousDate of ["2026-10-17", "2026-10-18"]) {
        const previousTime = new Date(`${previousDate}T23:59:59.900+08:00`);
        const currentTime = new Date(previousTime.getTime() + 1_000);
        const options = {deviceId: "midnight", buttonCount: 0, uiState: new DeviceUiState({fontKey}), homeConfig: home, clockFlipProgress: 1};
        const previous = renderDeviceCanvas({...options, currentTime: previousTime});
        const current = renderDeviceCanvas({...options, currentTime});
        const rects = computeDirtyRects(previous, current, [HEADER_REGION, TIME_REGION, FORECAST_REGION]);
        const covered = new Uint8Array(current.width * current.height);
        for (const rect of rects) {
          for (let y = rect.y; y < rect.y + rect.height; y += 1) {
            covered.fill(1, y * current.width + rect.x, y * current.width + rect.x + rect.width);
          }
        }
        const missed: Array<[number, number]> = [];
        let changedAtTop = 0;
        for (let pixel = 0; pixel < covered.length; pixel += 1) {
          const offset = pixel * 4;
          if (previous.rgba.readUInt32LE(offset) === current.rgba.readUInt32LE(offset)) continue;
          const x = pixel % current.width;
          const y = Math.floor(pixel / current.width);
          if (y < 8) changedAtTop += 1;
          if (!covered[pixel]) missed.push([x, y]);
        }
        expect(missed.slice(0, 8), `${previousDate} / ${layout}: first changed pixels outside partial rectangles`).toEqual([]);
        if (layout === "weather") expect(changedAtTop).toBeGreaterThan(0);
      }
    }
  });
});

describe("device diagnostic text", () => {
  test("distinguishes missing diagnostics from reported zero fragmentation", () => {
    const state = new DeviceUiState({page: "detail", detailIndex: SETTINGS_ITEMS.indexOf("Device")});
    const input = {currentTime: new Date("2026-11-12T12:00:00+08:00"), deviceId: "diagnostics", state, progress: 1};
    const missing = buildDeviceViewModel(input);
    expect(missing.page === "detail" && missing.kind === "rows" && missing.rows.find((row) => row.label === "Frag")?.value).toBe("waiting");
    state.diagnostics.heapFragmentation = 0;
    const reported = buildDeviceViewModel(input);
    expect(reported.page === "detail" && reported.kind === "rows" && reported.rows.find((row) => row.label === "Frag")?.value).toBe("0%");
  });
});
