import {
  FONT_LABELS,
  SETTINGS_ITEMS,
  type DeviceUiState,
} from "../../ui-state.js";
import type {
  DetailRowViewModel,
  DetailViewModel,
  DeviceViewModel,
  SettingsRowViewModel,
} from "../models/view-model.js";
import {buildClockFlipGlyphs} from "./clock-flip.js";
import {nextFontLabel} from "./font-registry.js";
import {buildHomeAmbientGameViewModel} from "./home-ambient-game.js";
import {buildHomeCopy} from "./home-copy.js";

export interface BuildDeviceViewModelInput {
  currentTime: Date;
  deviceId: string;
  state: DeviceUiState;
  progress: number;
  clockFlipProgress?: number;
  homeGameStep?: number;
}

export function buildDeviceViewModel(input: BuildDeviceViewModelInput): DeviceViewModel {
  const fontKey = resolveFontKeyForView(input.state);
  if (input.state.page === "settings") {
    return {
      page: "settings",
      fontKey,
      pulse: input.state.animation === "settings_select" ? pulse(input.progress) : 0,
      rows: buildSettingsRows(input.state),
    };
  }
  if (input.state.page === "detail") {
    return buildDetailViewModel(input, fontKey);
  }
  return {
    page: "home",
    fontKey,
    copy: buildHomeCopy(input.currentTime),
    clockGlyphs: buildClockFlipGlyphs(input.currentTime, {progress: input.clockFlipProgress}),
    game: buildHomeAmbientGameViewModel({currentTime: input.currentTime, step: input.homeGameStep ?? Math.floor(input.currentTime.getTime() / 1000)}),
  };
}

export function resolveFontKeyForView(state: DeviceUiState): string {
  if (state.page === "detail" && SETTINGS_ITEMS[state.detailIndex % SETTINGS_ITEMS.length] === "Font") {
    return state.pendingFontKey;
  }
  return state.fontKey;
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
      appliedLabel: input.state.brightness === input.state.pendingBrightness ? "applied" : `saved ${input.state.brightness}%`,
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

function buildRowsDetail(item: string, input: BuildDeviceViewModelInput): {title: string; subtitle: string; rows: DetailRowViewModel[]} {
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
        ["Next", FONT_LABELS[nextFontLabel(input.state.fontKey)] ?? "Font"],
        ["Engine", "React"],
        ["Layout", "Yoga"],
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
