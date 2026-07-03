import {afterEach, describe, expect, test, vi} from "vitest";

import {
  buildWeatherView,
  getWeatherSnapshot,
  parseOpenMeteo,
  parseOpenMeteoDays,
  refreshWeather,
  setWeatherSnapshotForTest,
  startWeatherPolling,
  tempColor,
  wmoLabel,
} from "./weather.js";

const SAMPLE = {
  hourly: {
    time: ["2026-06-29T06:00", "2026-06-29T07:00", "2026-06-29T08:00"],
    temperature_2m: [24.4, 25.7, 30.2],
    weather_code: [3, 51, 95],
    precipitation_probability: [10, 40, 88],
  },
  daily: {
    time: ["2026-06-29", "2026-06-30", "2026-07-01"],
    weather_code: [3, 61, 95],
    temperature_2m_max: [31.2, 29.6, 26.1],
    temperature_2m_min: [25.4, 25.1, 24.0],
    precipitation_probability_max: [20, 100, 80],
  },
};

afterEach(() => setWeatherSnapshotForTest(null));

describe("weather service", () => {
  test("parses Open-Meteo hourly payload", () => {
    const hours = parseOpenMeteo(SAMPLE);
    expect(hours).toHaveLength(3);
    expect(hours[0]).toEqual({time: "2026-06-29T06:00", temp: 24, code: 3, precip: 10});
    expect(hours[2]).toEqual({time: "2026-06-29T08:00", temp: 30, code: 95, precip: 88});
  });

  test("returns empty for malformed payloads", () => {
    expect(parseOpenMeteo(null)).toEqual([]);
    expect(parseOpenMeteo({})).toEqual([]);
    expect(parseOpenMeteo({hourly: {time: 5}})).toEqual([]);
  });

  test("maps WMO codes to Chinese labels", () => {
    expect(wmoLabel(0)).toBe("晴");
    expect(wmoLabel(3)).toBe("阴");
    expect(wmoLabel(65)).toBe("大雨");
    expect(wmoLabel(95)).toBe("雷阵雨");
  });

  test("parses Open-Meteo daily payload into labelled days", () => {
    const days = parseOpenMeteoDays(SAMPLE);
    expect(days).toHaveLength(3);
    expect(days[1]).toEqual({date: "2026-06-30", code: 61, tempMax: 30, tempMin: 25, precip: 100});
    expect(parseOpenMeteoDays({})).toEqual([]);
  });

  test("colours temperatures from cool to warm", () => {
    expect(tempColor(2)).not.toBe(tempColor(30)); // 冷暖不同色
    expect(typeof tempColor(26)).toBe("string");
  });

  test("builds a view with current condition, 12h extremes, and a 3-day outlook", () => {
    const view = buildWeatherView({fetchedAtMs: 0, hours: parseOpenMeteo(SAMPLE), days: parseOpenMeteoDays(SAMPLE)});
    expect(view).not.toBeNull();
    expect(view!.location).toBe("萧山");
    expect(view!.current).toMatchObject({temp: 24, label: "阴", icon: "overcast"});
    expect(view!.maxPrecip).toBe(88);
    expect(view!.tempLow).toBe(24);
    expect(view!.tempHigh).toBe(30);
    expect(view!.hours[2]).toMatchObject({hourLabel: "08", temp: 30, precip: 88, label: "雷阵雨", icon: "thunder"});
    expect(view!.days).toHaveLength(3);
    expect(view!.days[1]).toMatchObject({label: "明天", icon: "rain", tempMax: 30, tempMin: 25, precip: 100});
  });

  test("buildWeatherView returns null without data", () => {
    expect(buildWeatherView(null)).toBeNull();
    expect(buildWeatherView({fetchedAtMs: 0, hours: [], days: []})).toBeNull();
  });

  test("polling retries quickly while the snapshot is empty, then relaxes to the slow interval", async () => {
    vi.useFakeTimers();
    try {
      setWeatherSnapshotForTest(null);
      let calls = 0;
      let succeed = false;
      const flaky: typeof fetch = (async () => {
        calls += 1;
        if (!succeed) throw new Error("boot network blip");
        return {ok: true, json: async () => SAMPLE};
      }) as unknown as typeof fetch;

      const stop = startWeatherPolling({fetchImpl: flaky as never, intervalMs: 1000_000, emptyRetryMs: 1000});
      await vi.advanceTimersByTimeAsync(0);
      expect(calls).toBe(1); // 启动即首拉（失败）

      await vi.advanceTimersByTimeAsync(1000);
      expect(calls).toBe(2); // 空快照 → 短间隔重试，而不是等 30 分钟

      succeed = true;
      await vi.advanceTimersByTimeAsync(1000);
      expect(calls).toBe(3);
      expect(getWeatherSnapshot()).not.toBeNull();

      await vi.advanceTimersByTimeAsync(5000);
      expect(calls).toBe(3); // 拿到数据后回到慢间隔

      stop();
      await vi.advanceTimersByTimeAsync(2000_000);
      expect(calls).toBe(3); // stop 后不再拉
    } finally {
      vi.useRealTimers();
      setWeatherSnapshotForTest(null);
    }
  });

  test("refreshWeather caches a successful fetch and keeps the cache on failure", async () => {
    const ok: typeof fetch = (async () => ({ok: true, json: async () => SAMPLE})) as unknown as typeof fetch;
    await refreshWeather({fetchImpl: ok as never, nowMs: 1000});
    expect(getWeatherSnapshot()?.hours).toHaveLength(3);

    const fail: typeof fetch = (async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    await refreshWeather({fetchImpl: fail as never, nowMs: 2000});
    expect(getWeatherSnapshot()?.hours).toHaveLength(3); // 失败时保留上次缓存
  });
});
