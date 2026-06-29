export type PageName = "home" | "settings" | "detail";
export type InputEventName = "short_press" | "double_press" | "long_press";

export const FONT_WENKAI_SCREEN = "lxgw_wenkai_screen";
export const FONT_MAPLE_MONO_NF_CN = "maple_mono_nf_cn";
export const FONT_NOTO_CJK = "noto_cjk";
export const FONT_OPTIONS = [FONT_WENKAI_SCREEN, FONT_MAPLE_MONO_NF_CN, FONT_NOTO_CJK] as const;
export const FONT_LABELS: Record<string, string> = {
  [FONT_WENKAI_SCREEN]: "WenKai",
  [FONT_MAPLE_MONO_NF_CN]: "Maple",
  [FONT_NOTO_CJK]: "Noto",
};
export const SETTINGS_ITEMS = ["Brightness", "Font", "Device", "Renderer", "About", "Theme"] as const;
export const BRIGHTNESS_OPTIONS = [20, 40, 50, 60, 80, 100] as const;

export const THEME_MIDNIGHT = "midnight";
export const THEME_SAKURA = "sakura";
export const THEME_AMBER = "amber";
export const THEME_MONO = "mono";
export const THEME_OPTIONS = [THEME_MIDNIGHT, THEME_SAKURA, THEME_AMBER, THEME_MONO] as const;
export const THEME_LABELS: Record<string, string> = {
  [THEME_MIDNIGHT]: "Midnight",
  [THEME_SAKURA]: "Sakura",
  [THEME_AMBER]: "Amber",
  [THEME_MONO]: "Mono",
};

export class DeviceCommand {
  constructor(
    public type: string,
    public value: number,
    public persist = true,
  ) {}
}

export class DeviceDiagnostics {
  heapFree = 0;
  heapMaxBlock = 0;
  heapFragmentation = 0;
  wifiRssi = 0;
  uptimeMs = 0;
}

export interface DeviceUiStateInit {
  page?: PageName;
  selectedIndex?: number;
  detailIndex?: number;
  brightness?: number;
  pendingBrightness?: number;
  fontKey?: string;
  pendingFontKey?: string;
  themeKey?: string;
  pendingThemeKey?: string;
  animation?: string;
  animationStartedAt?: number;
  animationDuration?: number;
}

export class DeviceUiState {
  page: PageName = "home";
  selectedIndex = 0;
  detailIndex = 0;
  brightness = 50;
  pendingBrightness = 50;
  fontKey = FONT_WENKAI_SCREEN;
  pendingFontKey = FONT_WENKAI_SCREEN;
  themeKey = THEME_MIDNIGHT;
  pendingThemeKey = THEME_MIDNIGHT;
  diagnostics = new DeviceDiagnostics();
  animation = "";
  animationStartedAt = 0;
  animationDuration = 0.32;

  constructor(init: DeviceUiStateInit = {}) {
    Object.assign(this, init);
  }
}

export function applyInputEvent(state: DeviceUiState, event: InputEventName, now: number): DeviceCommand[] {
  if (state.page === "home") {
    if (event === "long_press") {
      state.page = "settings";
      state.selectedIndex = 0;
      startAnimation(state, "enter_settings", now);
    }
    return [];
  }

  if (state.page === "settings") {
    if (event === "short_press") {
      state.selectedIndex = (state.selectedIndex + 1) % SETTINGS_ITEMS.length;
      startAnimation(state, "settings_select", now);
    } else if (event === "long_press") {
      state.page = "detail";
      state.detailIndex = state.selectedIndex;
      if (isBrightnessDetail(state)) {
        state.pendingBrightness = state.brightness;
      } else if (isFontDetail(state)) {
        state.pendingFontKey = state.fontKey;
      } else if (isThemeDetail(state)) {
        state.pendingThemeKey = state.themeKey;
      }
      startAnimation(state, "enter_detail", now);
    } else if (event === "double_press") {
      state.page = "home";
      startAnimation(state, "back_home", now);
    }
    return [];
  }

  if (isBrightnessDetail(state)) {
    if (event === "short_press") {
      state.pendingBrightness = nextBrightnessValue(state.pendingBrightness);
      state.brightness = state.pendingBrightness;
      startAnimation(state, "brightness_adjust", now);
      return [new DeviceCommand("set_brightness", state.brightness)];
    } else if (event === "long_press") {
      const changed = state.brightness !== state.pendingBrightness;
      state.brightness = state.pendingBrightness;
      startAnimation(state, "brightness_applied", now);
      return changed ? [new DeviceCommand("set_brightness", state.brightness)] : [];
    } else if (event === "double_press") {
      state.page = "settings";
      startAnimation(state, "back_to_settings", now);
    }
    return [];
  }

  if (isFontDetail(state)) {
    // 字体切换本身会改变页面文字（一次性可见），但没有任何动画消费 font_select /
    // font_applied，故不再启动空动画，避免 0.32s 内 20fps 的无效重渲染。
    if (event === "short_press") {
      state.pendingFontKey = nextFontKey(state.pendingFontKey);
      state.fontKey = state.pendingFontKey;
    } else if (event === "long_press") {
      state.fontKey = state.pendingFontKey;
    } else if (event === "double_press") {
      state.pendingFontKey = state.fontKey;
      state.page = "settings";
      startAnimation(state, "back_to_settings", now);
    }
    return [];
  }

  if (isThemeDetail(state)) {
    if (event === "short_press") {
      state.pendingThemeKey = nextThemeKey(state.pendingThemeKey);
      state.themeKey = state.pendingThemeKey;
    } else if (event === "long_press") {
      state.themeKey = state.pendingThemeKey;
    } else if (event === "double_press") {
      state.pendingThemeKey = state.themeKey;
      state.page = "settings";
      startAnimation(state, "back_to_settings", now);
    }
    return [];
  }

  // 只读详情页（Device/Renderer/About/Weather）：short_press 无可见效果，不再触发
  // detail_pulse 空动画；long_press / double_press 返回设置页。
  if (event !== "short_press") {
    state.page = "settings";
    startAnimation(state, "back_to_settings", now);
  }
  return [];
}

export function currentAnimationProgress(state: DeviceUiState, now: number): number {
  if (!state.animation) {
    return 1;
  }
  const elapsed = Math.max(0, now - state.animationStartedAt);
  if (state.animationDuration <= 0) {
    return 1;
  }
  return Math.min(1, elapsed / state.animationDuration);
}

export function isAnimationActive(state: DeviceUiState, now: number): boolean {
  return currentAnimationProgress(state, now) < 1;
}

export function easeOutCubic(value: number): number {
  const clamped = Math.min(1, Math.max(0, value));
  return 1 - Math.pow(1 - clamped, 3);
}

function startAnimation(state: DeviceUiState, name: string, now: number): void {
  state.animation = name;
  state.animationStartedAt = now;
}

function isBrightnessDetail(state: DeviceUiState): boolean {
  return SETTINGS_ITEMS[state.detailIndex % SETTINGS_ITEMS.length] === "Brightness";
}

function isFontDetail(state: DeviceUiState): boolean {
  return SETTINGS_ITEMS[state.detailIndex % SETTINGS_ITEMS.length] === "Font";
}

function isThemeDetail(state: DeviceUiState): boolean {
  return SETTINGS_ITEMS[state.detailIndex % SETTINGS_ITEMS.length] === "Theme";
}

function nextBrightnessValue(value: number): number {
  for (const option of BRIGHTNESS_OPTIONS) {
    if (option > value) return option;
  }
  return BRIGHTNESS_OPTIONS[0];
}

export function nextFontKey(value: string): string {
  const index = FONT_OPTIONS.findIndex((option) => option === value);
  if (index < 0) return FONT_OPTIONS[0];
  return FONT_OPTIONS[(index + 1) % FONT_OPTIONS.length];
}

export function nextThemeKey(value: string): string {
  const index = THEME_OPTIONS.findIndex((option) => option === value);
  if (index < 0) return THEME_OPTIONS[0];
  return THEME_OPTIONS[(index + 1) % THEME_OPTIONS.length];
}
