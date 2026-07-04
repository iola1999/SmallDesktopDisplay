import {
  FONT_LABELS,
  SETTINGS_ITEMS,
  THEME_LABELS,
  easeOutCubic,
  nextFontKey,
  nextThemeKey,
  type DeviceUiState,
} from "../../ui-state.js";
import type {
  DetailRowViewModel,
  DetailViewModel,
  DeviceViewModel,
  SettingsRowViewModel,
} from "../models/view-model.js";
import {buildClockFlipGlyphs} from "./clock-flip.js";
import {resolveClockTheme} from "./clock-theme.js";
import {buildHomeCopy} from "./home-copy.js";
import {buildWeatherView, getWeatherSnapshot} from "./weather.js";

export interface BuildDeviceViewModelInput {
  currentTime: Date;
  deviceId: string;
  state: DeviceUiState;
  progress: number;
  clockFlipProgress?: number;
}

export function buildDeviceViewModel(input: BuildDeviceViewModelInput): DeviceViewModel {
  const fontKey = resolveFontKeyForView(input.state);
  if (input.state.page === "settings") {
    const sliding = input.state.animation === "settings_select";
    return {
      page: "settings",
      fontKey,
      pulse: sliding ? pulse(input.progress) : 0,
      highlightFromIndex: sliding ? input.state.previousSelectedIndex : input.state.selectedIndex,
      highlightProgress: sliding ? easeOutCubic(input.progress) : 1,
      rows: buildSettingsRows(input.state),
    };
  }
  if (input.state.page === "detail") {
    return buildDetailViewModel(input, fontKey);
  }
  const theme = resolveClockTheme(resolveThemeKeyForView(input.state));
  return {
    page: "home",
    fontKey,
    copy: buildHomeCopy(input.currentTime),
    clockGlyphs: buildClockFlipGlyphs(input.currentTime, {
      progress: input.clockFlipProgress,
      timeColor: theme.time,
      secondsColor: theme.seconds,
    }),
    theme,
    weather: buildWeatherView(getWeatherSnapshot()) ?? undefined,
  };
}

export function resolveFontKeyForView(state: DeviceUiState): string {
  if (state.page === "detail" && SETTINGS_ITEMS[state.detailIndex % SETTINGS_ITEMS.length] === "Font") {
    return state.pendingFontKey;
  }
  return state.fontKey;
}

export function resolveThemeKeyForView(state: DeviceUiState): string {
  if (state.page === "detail" && SETTINGS_ITEMS[state.detailIndex % SETTINGS_ITEMS.length] === "Theme") {
    return state.pendingThemeKey;
  }
  return state.themeKey;
}

function buildSettingsRows(state: DeviceUiState): SettingsRowViewModel[] {
  return SETTINGS_ITEMS.map((item, index) => ({
    key: item,
    indexLabel: String(index + 1),
    label: item,
    selected: index === state.selectedIndex,
    value: settingValue(item, state),
    valueWidth: item === "Brightness" ? 42 : 50,
    valueX: item === "Brightness" ? 186 : 174,
  }));
}

function settingValue(item: string, state: DeviceUiState): string | undefined {
  if (item === "Brightness") return `${state.brightness}%`;
  if (item === "Font") return FONT_LABELS[state.fontKey] ?? "Font";
  return undefined;
}

function buildDetailViewModel(input: BuildDeviceViewModelInput, fontKey: string): DetailViewModel {
  const item = SETTINGS_ITEMS[input.state.detailIndex % SETTINGS_ITEMS.length];
  if (item === "Brightness") {
    const value = Math.max(0, Math.min(100, input.state.pendingBrightness));
    const isAnimating = ["brightness_adjust", "brightness_applied"].includes(input.state.animation);
    return {
      page: "detail",
      kind: "brightness",
      fontKey,
      title: "Brightness",
      subtitle: "short apply",
      valueLabel: `${value}%`,
      // short_press / long_press 都会让 brightness 与 pendingBrightness 同步，
      // 且亮度详情页期间不接受状态同步覆盖，因此此处恒为 applied。
      appliedLabel: "applied",
      fillWidth: Math.round(170 * (value / 100)),
      pulse: isAnimating ? pulse(input.progress) : 0,
    };
  }
  return {
    page: "detail",
    kind: "rows",
    fontKey,
    ...buildRowsDetail(item, input),
  };
}

function buildRowsDetail(
  item: string,
  input: BuildDeviceViewModelInput,
): {title: string; subtitle: string; rows: DetailRowViewModel[]; themePreview?: import("./clock-theme.js").ClockTheme} {
  if (item === "Device") {
    return {
      title: "Device",
      subtitle: "client diagnostics",
      rows: [
        ["Heap", input.state.diagnostics.heapFree ? formatKb(input.state.diagnostics.heapFree) : "waiting"],
        ["Block", input.state.diagnostics.heapMaxBlock ? formatKb(input.state.diagnostics.heapMaxBlock) : "waiting"],
        ["Frag", input.state.diagnostics.heapFragmentation ? `${input.state.diagnostics.heapFragmentation}%` : "waiting"],
        ["RSSI", input.state.diagnostics.wifiRssi ? `${input.state.diagnostics.wifiRssi} dBm` : "waiting"],
      ].map(([label, value]) => ({label, value})),
    };
  }
  if (item === "Renderer") {
    return {
      title: "Renderer",
      subtitle: "remote frame link",
      rows: toRows([["Mode", "HTTP keep-alive"], ["Poll", "50 ms"], ["Wait", "10 ms"], ["Frames", "SDD1 diff"]]),
    };
  }
  if (item === "About") {
    return {
      title: "About",
      subtitle: "SmallDesktopDisplay",
      rows: toRows([["Device", input.deviceId.slice(0, 14)], ["UI", "react-render"], ["Build", "node"], ["Protocol", "SDD1"]]),
    };
  }
  if (item === "Font") {
    return {
      title: "Font",
      subtitle: "short apply",
      rows: toRows([
        ["Current", FONT_LABELS[input.state.fontKey] ?? "Font"],
        ["Next", FONT_LABELS[nextFontKey(input.state.fontKey)] ?? "Font"],
        ["Engine", "React"],
        ["Layout", "Yoga"],
      ]),
    };
  }
  if (item === "Theme") {
    return {
      title: "Theme",
      subtitle: "short apply",
      // 用待选主题染整页：短按切换立即能在当前页看到配色变化。
      themePreview: resolveClockTheme(input.state.pendingThemeKey),
      rows: toRows([
        ["Current", THEME_LABELS[input.state.themeKey] ?? "Theme"],
        ["Next", THEME_LABELS[nextThemeKey(input.state.themeKey)] ?? "Theme"],
        ["Scope", "clock palette"],
        ["Apply", "long press"],
      ]),
    };
  }
  return {
    title: item,
    subtitle: "Setting detail",
    rows: toRows([["Preview", "only"], ["More", "controls next"]]),
  };
}

function toRows(rows: Array<[string, string]>): DetailRowViewModel[] {
  return rows.map(([label, value]) => ({label, value}));
}

function pulse(progress: number): number {
  return Math.sin(Math.min(1, progress) * Math.PI);
}

function formatKb(value: number): string {
  return `${Math.round(value / 1024)} KB`;
}
