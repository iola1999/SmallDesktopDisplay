import type {HomeCopy} from "../types.js";
import type {ClockTheme} from "../services/clock-theme.js";
import type {WeatherView} from "../services/weather.js";

export type DeviceViewModel = HomeViewModel | SettingsViewModel | DetailViewModel;

export interface BaseViewModel {
  fontKey: string;
}

export interface HomeViewModel extends BaseViewModel {
  page: "home";
  copy: HomeCopy;
  clockGlyphs: ClockFlipGlyphViewModel[];
  theme: ClockTheme;
  weather?: WeatherView;
  // 首页暗背景数字雨的步进（每 2 秒 +1），由墙钟推导，无需持久状态。
  rainTick: number;
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

export interface AutoRainViewModel {
  columns: number;
  rows: number;
  cellSize: number;
  cells: RainCellViewModel[];
}

export interface RainCellViewModel {
  x: number;
  y: number;
  level: number;
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
