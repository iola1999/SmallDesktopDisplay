import {
  FONT_MAPLE_MONO_NF_CN,
  FONT_NOTO_CJK,
  FONT_OPTIONS,
  FONT_WENKAI_SCREEN,
  THEME_AMBER,
  THEME_DUSK,
  THEME_MIDNIGHT,
  THEME_MONO,
  THEME_OPTIONS,
  THEME_SAKURA,
} from "../ui-state.js";

export const CONFIG_SCHEMA_VERSION = 1 as const;

export const HOME_LAYOUT_OPTIONS = ["balanced", "clock", "weather"] as const;
export type HomeLayout = (typeof HOME_LAYOUT_OPTIONS)[number];

export interface AppearanceConfig {
  themeKey: string;
  fontKey: string;
}

export interface HomeHeaderConfig {
  showDate: boolean;
  showLunar: boolean;
}

export interface HomeWeatherConfig {
  showCurrent: boolean;
  showTodayRange: boolean;
  showDailyOutlook: boolean;
}

export interface HomeConfig {
  layout: HomeLayout;
  header: HomeHeaderConfig;
  weather: HomeWeatherConfig;
}

export interface DeviceConfig {
  appearance: AppearanceConfig;
  home: HomeConfig;
}

export interface ConfigDocument {
  schemaVersion: typeof CONFIG_SCHEMA_VERSION;
  revision: number;
  devices: Record<string, DeviceConfig>;
}

export interface DeviceConfigPatch {
  appearance?: Partial<AppearanceConfig>;
  home?: {
    layout?: HomeLayout;
    header?: Partial<HomeHeaderConfig>;
    weather?: Partial<HomeWeatherConfig>;
  };
}

export const DEFAULT_APPEARANCE_CONFIG: AppearanceConfig = {
  themeKey: THEME_MIDNIGHT,
  fontKey: FONT_WENKAI_SCREEN,
};

export const DEFAULT_HOME_CONFIG: HomeConfig = {
  layout: "balanced",
  header: {
    showDate: true,
    showLunar: true,
  },
  weather: {
    showCurrent: true,
    showTodayRange: true,
    showDailyOutlook: true,
  },
};

export const THEME_CATALOG = [
  {key: THEME_MIDNIGHT, label: "Ink 石墨蓝", color: "#7d96c8"},
  {key: THEME_DUSK, label: "Dusk 暮紫", color: "#a68fd0"},
  {key: THEME_SAKURA, label: "Sakura 樱粉", color: "#e08bb0"},
  {key: THEME_AMBER, label: "Amber 琥珀", color: "#dda45c"},
  {key: THEME_MONO, label: "Mono 纯灰", color: "#999fa5"},
] as const;

export const FONT_CATALOG = [
  {key: FONT_WENKAI_SCREEN, label: "霞鹜文楷"},
  {key: FONT_MAPLE_MONO_NF_CN, label: "Maple Mono"},
  {key: FONT_NOTO_CJK, label: "Noto CJK"},
] as const;

export const HOME_LAYOUT_CATALOG = [
  {key: "balanced", label: "均衡", description: "时钟、日期和天气信息均衡排列"},
  {key: "clock", label: "时钟", description: "突出时间，保留精简辅助信息"},
  {key: "weather", label: "天气", description: "缩小时钟，为天气预报留出更多空间"},
] as const;

export class ConfigValidationError extends Error {}

export function createDefaultDeviceConfig(): DeviceConfig {
  return cloneDeviceConfig({appearance: DEFAULT_APPEARANCE_CONFIG, home: DEFAULT_HOME_CONFIG});
}

export function createEmptyConfigDocument(): ConfigDocument {
  return {schemaVersion: CONFIG_SCHEMA_VERSION, revision: 0, devices: Object.create(null)};
}

export function cloneDeviceConfig(config: DeviceConfig): DeviceConfig {
  return {
    appearance: {...config.appearance},
    home: {
      layout: config.home.layout,
      header: {...config.home.header},
      weather: {...config.home.weather},
    },
  };
}

export function cloneConfigDocument(document: ConfigDocument): ConfigDocument {
  const devices: Record<string, DeviceConfig> = Object.create(null);
  for (const [deviceId, config] of Object.entries(document.devices)) {
    devices[deviceId] = cloneDeviceConfig(config);
  }
  return {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    revision: document.revision,
    devices,
  };
}

export function isValidDeviceId(value: string): boolean {
  // 服务端保留所有非空历史 ID。设备配网页对新值执行更严格的传输安全规则。
  return value.length > 0;
}

export function parseDeviceConfigPatch(value: unknown): DeviceConfigPatch {
  const root = requireRecord(value, "config");
  assertKnownKeys(root, ["appearance", "home"], "config");
  const patch: DeviceConfigPatch = {};

  if (root.appearance !== undefined) {
    const appearance = requireRecord(root.appearance, "appearance");
    assertKnownKeys(appearance, ["themeKey", "fontKey"], "appearance");
    const parsed: Partial<AppearanceConfig> = {};
    if (appearance.themeKey !== undefined) {
      if (typeof appearance.themeKey !== "string" || !(THEME_OPTIONS as readonly string[]).includes(appearance.themeKey)) {
        throw new ConfigValidationError("unknown themeKey");
      }
      parsed.themeKey = appearance.themeKey;
    }
    if (appearance.fontKey !== undefined) {
      if (typeof appearance.fontKey !== "string" || !(FONT_OPTIONS as readonly string[]).includes(appearance.fontKey)) {
        throw new ConfigValidationError("unknown fontKey");
      }
      parsed.fontKey = appearance.fontKey;
    }
    patch.appearance = parsed;
  }

  if (root.home !== undefined) {
    const home = requireRecord(root.home, "home");
    assertKnownKeys(home, ["layout", "header", "weather"], "home");
    const parsed: NonNullable<DeviceConfigPatch["home"]> = {};
    if (home.layout !== undefined) {
      if (typeof home.layout !== "string" || !(HOME_LAYOUT_OPTIONS as readonly string[]).includes(home.layout)) {
        throw new ConfigValidationError("unknown home layout");
      }
      parsed.layout = home.layout as HomeLayout;
    }
    if (home.header !== undefined) {
      const header = requireRecord(home.header, "home.header");
      assertKnownKeys(header, ["showDate", "showLunar"], "home.header");
      parsed.header = parseBooleanFields(header, ["showDate", "showLunar"], "home.header");
    }
    if (home.weather !== undefined) {
      const weather = requireRecord(home.weather, "home.weather");
      assertKnownKeys(weather, ["showCurrent", "showTodayRange", "showDailyOutlook"], "home.weather");
      parsed.weather = parseBooleanFields(
        weather,
        ["showCurrent", "showTodayRange", "showDailyOutlook"],
        "home.weather",
      );
    }
    patch.home = parsed;
  }
  return patch;
}

export function mergeDeviceConfig(base: DeviceConfig, patch: DeviceConfigPatch): DeviceConfig {
  return {
    appearance: {...base.appearance, ...patch.appearance},
    home: {
      ...base.home,
      ...patch.home,
      header: {...base.home.header, ...patch.home?.header},
      weather: {...base.home.weather, ...patch.home?.weather},
    },
  };
}

export function parseConfigDocument(value: unknown): ConfigDocument {
  const root = requireRecord(value, "config document");
  assertKnownKeys(root, ["schemaVersion", "revision", "devices"], "config document");
  if (root.schemaVersion !== CONFIG_SCHEMA_VERSION) {
    throw new ConfigValidationError(`unsupported schemaVersion: ${String(root.schemaVersion)}`);
  }
  if (!Number.isSafeInteger(root.revision) || (root.revision as number) < 0) {
    throw new ConfigValidationError("revision must be a non-negative integer");
  }
  const devices = requireRecord(root.devices, "devices");
  const parsedDevices: Record<string, DeviceConfig> = Object.create(null);
  for (const [deviceId, config] of Object.entries(devices)) {
    if (!isValidDeviceId(deviceId)) {
      throw new ConfigValidationError(`invalid device id: ${deviceId}`);
    }
    parsedDevices[deviceId] = mergeDeviceConfig(createDefaultDeviceConfig(), parseDeviceConfigPatch(config));
  }
  return {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    revision: root.revision as number,
    devices: parsedDevices,
  };
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ConfigValidationError(`${field} must be an object`);
  }
  return value as Record<string, unknown>;
}

function assertKnownKeys(value: Record<string, unknown>, allowed: readonly string[], field: string): void {
  const unknown = Object.keys(value).find((key) => !allowed.includes(key));
  if (unknown !== undefined) {
    throw new ConfigValidationError(`unknown ${field} field: ${unknown}`);
  }
}

function parseBooleanFields<T extends string>(
  value: Record<string, unknown>,
  fields: readonly T[],
  prefix: string,
): Partial<Record<T, boolean>> {
  const parsed: Partial<Record<T, boolean>> = {};
  for (const field of fields) {
    if (value[field] === undefined) continue;
    if (typeof value[field] !== "boolean") {
      throw new ConfigValidationError(`${prefix}.${field} must be boolean`);
    }
    parsed[field] = value[field];
  }
  return parsed;
}
