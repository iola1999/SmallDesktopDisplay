export type HomeLayout = "balanced" | "clock" | "weather";

export interface ThemeOption {
  key: string;
  label: string;
  color: string;
}

export interface FontOption {
  key: string;
  label: string;
}

export interface HomeLayoutOption {
  key: HomeLayout;
  label: string;
  description: string;
}

export interface Catalog {
  schemaVersion: number;
  themes: ThemeOption[];
  fonts: FontOption[];
  homeLayouts: HomeLayoutOption[];
  brightness: {
    min: number;
    max: number;
    step: number;
    storage: "device";
  };
}

export interface DeviceConfig {
  appearance: {
    themeKey: string;
    fontKey: string;
    [key: string]: unknown;
  };
  home: {
    layout: HomeLayout;
    header: {
      showDate: boolean;
      showLunar: boolean;
      [key: string]: unknown;
    };
    weather: {
      showCurrent: boolean;
      showTodayRange: boolean;
      showDailyOutlook: boolean;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface DeviceConfigDocument {
  schemaVersion: number;
  revision: number;
  deviceId: string;
  config: DeviceConfig;
  etag: string;
}

export interface DeviceSummary {
  deviceId: string;
  page: string;
  themeKey: string;
  fontKey: string;
  brightness: number;
  frameId: number;
  idleSeconds: number;
  online?: boolean;
  lastSeenSeconds?: number | null;
  lastCommunicationSeconds?: number | null;
  transport?: string;
  diagnostics?: {
    heapFree?: number;
    heapMaxBlock?: number;
    heapFragmentation?: number;
    wifiRssi?: number;
    uptimeMs: number;
  } | null;
}

export interface DevicesResponse {
  devices: DeviceSummary[];
}

export interface ServiceStatus {
  weather?: {
    hasData: boolean;
    location?: string;
    ageSeconds?: number;
  };
  deviceCount?: number;
  config?: {
    schemaVersion: number;
    revision: number;
    writable: boolean;
    error: string | null;
  };
  [key: string]: unknown;
}

export type GestureName = "short_press" | "double_press" | "long_press";
export type ConsoleSection = "devices" | "home" | "appearance" | "diagnostics";
