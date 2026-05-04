import type {HomeCopy} from "../types.js";

export type DeviceViewModel = HomeViewModel | SettingsViewModel | DetailViewModel;

export interface BaseViewModel {
  fontKey: string;
}

export interface HomeViewModel extends BaseViewModel {
  page: "home";
  copy: HomeCopy;
  clockGlyphs: ClockFlipGlyphViewModel[];
}

export type ClockFlipGlyphGroup = "time" | "seconds";

export interface ClockFlipGlyphViewModel {
  key: string;
  group: ClockFlipGlyphGroup;
  char: string;
  previousChar: string;
  progress: number;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  color: string;
}

export interface SettingsViewModel extends BaseViewModel {
  page: "settings";
  pulse: number;
  rows: SettingsRowViewModel[];
}

export interface SettingsRowViewModel {
  key: string;
  indexLabel: string;
  label: string;
  selected: boolean;
  value?: string;
  valueWidth?: number;
  valueX?: number;
}

export type DetailViewModel = BrightnessDetailViewModel | RowsDetailViewModel;

export interface BrightnessDetailViewModel extends BaseViewModel {
  page: "detail";
  kind: "brightness";
  title: string;
  subtitle: string;
  valueLabel: string;
  appliedLabel: string;
  fillWidth: number;
  pulse: number;
}

export interface RowsDetailViewModel extends BaseViewModel {
  page: "detail";
  kind: "rows";
  title: string;
  subtitle: string;
  rows: DetailRowViewModel[];
}

export interface DetailRowViewModel {
  label: string;
  value: string;
}
