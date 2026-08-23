import {describe, expect, test} from "vitest";

import {createDefaultDeviceConfig} from "../config/schema.js";
import {DeviceUiState} from "../ui-state.js";
import {renderDeviceCanvas} from "./rendering/device-canvas.js";
import {setWeatherSnapshotForTest, type WeatherSnapshot} from "./services/weather.js";

const NOW = new Date("2026-08-23T12:34:56.000+08:00");
const WEATHER: WeatherSnapshot = {
  fetchedAtMs: NOW.getTime(),
  hours: [{time: "2026-08-23T12:00", temp: 31, code: 1, precip: 10}],
  days: [
    {date: "2026-08-23", code: 1, tempMax: 34, tempMin: 26, precip: 10},
    {date: "2026-08-24", code: 2, tempMax: 32, tempMin: 25, precip: 20},
    {date: "2026-08-25", code: 61, tempMax: 29, tempMin: 23, precip: 70},
  ],
};

describe("home configuration rendering", () => {
  test("the explicit balanced defaults preserve the existing default canvas", () => {
    setWeatherSnapshotForTest(WEATHER);
    const state = new DeviceUiState();
    const implicit = renderDeviceCanvas({currentTime: NOW, deviceId: "desk-home", buttonCount: 0, uiState: state});
    const explicit = renderDeviceCanvas({
      currentTime: NOW,
      deviceId: "desk-home",
      buttonCount: 0,
      uiState: state,
      homeConfig: createDefaultDeviceConfig().home,
    });
    expect(Buffer.compare(implicit.rgba, explicit.rgba)).toBe(0);
  });

  test("clock and weather presets produce distinct canvases", () => {
    setWeatherSnapshotForTest(WEATHER);
    const state = new DeviceUiState();
    const balancedConfig = createDefaultDeviceConfig().home;
    const clockConfig = {...balancedConfig, layout: "clock" as const};
    const weatherConfig = {...balancedConfig, layout: "weather" as const};
    const balanced = renderDeviceCanvas({currentTime: NOW, deviceId: "desk-home", buttonCount: 0, uiState: state, homeConfig: balancedConfig});
    const clock = renderDeviceCanvas({currentTime: NOW, deviceId: "desk-home", buttonCount: 0, uiState: state, homeConfig: clockConfig});
    const weather = renderDeviceCanvas({currentTime: NOW, deviceId: "desk-home", buttonCount: 0, uiState: state, homeConfig: weatherConfig});

    expect(Buffer.compare(balanced.rgba, clock.rgba)).not.toBe(0);
    expect(Buffer.compare(balanced.rgba, weather.rgba)).not.toBe(0);
    expect(Buffer.compare(clock.rgba, weather.rgba)).not.toBe(0);
  });

  test("header and weather switches remove their pixels", () => {
    setWeatherSnapshotForTest(WEATHER);
    const state = new DeviceUiState();
    const visible = createDefaultDeviceConfig().home;
    const hidden = {
      ...visible,
      header: {showDate: false, showLunar: false},
      weather: {showCurrent: false, showTodayRange: false, showDailyOutlook: false},
    };
    const withContent = renderDeviceCanvas({currentTime: NOW, deviceId: "desk-home", buttonCount: 0, uiState: state, homeConfig: visible});
    const withoutContent = renderDeviceCanvas({currentTime: NOW, deviceId: "desk-home", buttonCount: 0, uiState: state, homeConfig: hidden});
    expect(Buffer.compare(withContent.rgba, withoutContent.rgba)).not.toBe(0);
  });
});
