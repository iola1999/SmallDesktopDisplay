// 可选天气：服务端定时拉取浙江杭州萧山区未来 12 小时预报并缓存。
// 数据源 Open-Meteo（免费、无需 API key、含中国）。失败保持静默并沿用上次缓存，
// 渲染层在没有数据时不显示天气，不影响时钟主流程。

// 杭州市萧山区大致坐标
const XIAOSHAN_LATITUDE = 30.18;
const XIAOSHAN_LONGITUDE = 120.27;
export const WEATHER_LOCATION_LABEL = "萧山";

const FORECAST_HOURS = 12;
const DEFAULT_REFRESH_MS = 30 * 60 * 1000; // 30 分钟
export const WEATHER_MAX_AGE_MS = 2 * DEFAULT_REFRESH_MS;
// 还没有任何缓存时（典型：容器刚启动首拉超时）用短间隔重试，
// 否则一次网络抖动会让屏幕空 30 分钟天气。
const DEFAULT_EMPTY_RETRY_MS = 30 * 1000;
const FETCH_TIMEOUT_MS = 10 * 1000;

export interface WeatherHour {
  time: string; // ISO，本地时区
  temp: number; // 摄氏度
  code: number; // WMO weather code
  precip: number; // 降水概率 %
}

export interface WeatherDay {
  date: string; // "2026-06-30"
  code: number;
  tempMax: number;
  tempMin: number;
  precip: number; // 当日最大降水概率 %
}

export interface WeatherSnapshot {
  fetchedAtMs: number;
  hours: WeatherHour[];
  days: WeatherDay[];
}

export type WeatherIconKind = "sun" | "cloud" | "overcast" | "fog" | "rain" | "snow" | "thunder";

export interface WeatherHourView {
  hourLabel: string; // "09"
  temp: number;
  precip: number;
  label: string;
  icon: WeatherIconKind;
}

export interface WeatherDayView {
  dayOffset: number; // 距上海当前日期的天数，0 为今天
  label: string; // "明天" / "后天"
  icon: WeatherIconKind;
  tempMax: number;
  tempMin: number;
  precip: number;
}

export interface WeatherView {
  location: string;
  current?: {temp: number; label: string; code: number; icon: WeatherIconKind};
  maxPrecip?: number;
  tempLow?: number;
  tempHigh?: number;
  hours: WeatherHourView[];
  days: WeatherDayView[];
}

const FORECAST_DAYS = 3;
const OPEN_METEO_URL =
  `https://api.open-meteo.com/v1/forecast?latitude=${XIAOSHAN_LATITUDE}&longitude=${XIAOSHAN_LONGITUDE}` +
  `&hourly=temperature_2m,weather_code,precipitation_probability&forecast_hours=${FORECAST_HOURS}` +
  `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=${FORECAST_DAYS}` +
  `&timezone=Asia%2FShanghai`;

let snapshot: WeatherSnapshot | null = null;
let pollTimer: ReturnType<typeof setTimeout> | null = null;
let pollGeneration = 0;

export function getWeatherSnapshot(): WeatherSnapshot | null {
  return snapshot;
}

// 仅供测试使用：直接注入快照。
export function setWeatherSnapshotForTest(value: WeatherSnapshot | null): void {
  snapshot = value;
}

type FetchLike = (url: string, init?: {signal?: AbortSignal}) => Promise<{ok: boolean; json: () => Promise<unknown>}>;

export interface RefreshWeatherOptions {
  fetchImpl?: FetchLike;
  nowMs?: number;
}

export async function refreshWeather(options: RefreshWeatherOptions = {}): Promise<WeatherSnapshot | null> {
  const fetchImpl = options.fetchImpl ?? (globalThis.fetch as unknown as FetchLike | undefined);
  if (!fetchImpl) {
    return snapshot;
  }
  const controller = typeof AbortController !== "undefined" ? new AbortController() : undefined;
  const timer = controller ? setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS) : undefined;
  try {
    const response = await fetchImpl(OPEN_METEO_URL, controller ? {signal: controller.signal} : undefined);
    if (!response.ok) {
      return snapshot;
    }
    const payload = await response.json();
    const hours = parseOpenMeteo(payload);
    if (hours.length > 0) {
      snapshot = {fetchedAtMs: options.nowMs ?? Date.now(), hours, days: parseOpenMeteoDays(payload)};
    }
    return snapshot;
  } catch (error) {
    // 静默失败：保留上次缓存，不打断时钟渲染。
    console.warn("[Weather] refresh failed:", error instanceof Error ? error.message : error);
    return snapshot;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function startWeatherPolling(
  options: RefreshWeatherOptions & {intervalMs?: number; emptyRetryMs?: number} = {},
): () => void {
  const intervalMs = options.intervalMs ?? DEFAULT_REFRESH_MS;
  const emptyRetryMs = options.emptyRetryMs ?? DEFAULT_EMPTY_RETRY_MS;
  stopWeatherPolling();
  const generation = pollGeneration;

  const schedule = (delayMs: number): void => {
    pollTimer = setTimeout(run, delayMs);
    if (typeof pollTimer === "object" && pollTimer && "unref" in pollTimer) {
      (pollTimer as {unref?: () => void}).unref?.();
    }
  };
  const run = (): void => {
    void refreshWeather(options).then(() => {
      if (generation !== pollGeneration) return; // 已被 stop / 重启
      schedule(snapshot ? intervalMs : emptyRetryMs);
    });
  };
  run();
  return stopWeatherPolling;
}

export function stopWeatherPolling(): void {
  pollGeneration += 1;
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
}

export function parseOpenMeteo(payload: unknown): WeatherHour[] {
  const hourly = (payload as {hourly?: Record<string, unknown>} | null)?.hourly;
  if (!hourly) return [];
  const time = hourly.time as string[] | undefined;
  const temperature = hourly.temperature_2m as number[] | undefined;
  const code = hourly.weather_code as number[] | undefined;
  const precip = hourly.precipitation_probability as number[] | undefined;
  if (!Array.isArray(time) || !Array.isArray(temperature)) return [];
  const count = Math.min(time.length, temperature.length, FORECAST_HOURS);
  const hours: WeatherHour[] = [];
  for (let index = 0; index < count; index += 1) {
    hours.push({
      time: time[index],
      temp: Math.round(temperature[index]),
      code: Math.round(code?.[index] ?? 0),
      precip: Math.round(precip?.[index] ?? 0),
    });
  }
  return hours;
}

export function parseOpenMeteoDays(payload: unknown): WeatherDay[] {
  const daily = (payload as {daily?: Record<string, unknown>} | null)?.daily;
  if (!daily) return [];
  const time = daily.time as string[] | undefined;
  const code = daily.weather_code as number[] | undefined;
  const tempMax = daily.temperature_2m_max as number[] | undefined;
  const tempMin = daily.temperature_2m_min as number[] | undefined;
  const precip = daily.precipitation_probability_max as number[] | undefined;
  if (!Array.isArray(time) || !Array.isArray(tempMax) || !Array.isArray(tempMin)) return [];
  const count = Math.min(time.length, tempMax.length, tempMin.length, FORECAST_DAYS);
  const days: WeatherDay[] = [];
  for (let index = 0; index < count; index += 1) {
    days.push({
      date: time[index],
      code: Math.round(code?.[index] ?? 0),
      tempMax: Math.round(tempMax[index]),
      tempMin: Math.round(tempMin[index]),
      precip: Math.round(precip?.[index] ?? 0),
    });
  }
  return days;
}

const DAY_LABELS = ["今天", "明天", "后天"];

export function buildWeatherView(input: WeatherSnapshot | null, currentTime: Date): WeatherView | null {
  if (!input || currentTime.getTime() - input.fetchedAtMs > WEATHER_MAX_AGE_MS) return null;
  // API 时间不带偏移，固定为 Asia/Shanghai；按相同日期与小时匹配，独立于宿主机时区。
  const localTime = new Date(currentTime.getTime() + 8 * 60 * 60 * 1000).toISOString();
  const currentHour = localTime.slice(0, 13);
  const todayMs = Date.parse(`${localTime.slice(0, 10)}T00:00:00Z`);
  const hours = input.hours.filter((hour) => hour.time.slice(0, 13) >= currentHour);
  const temps = hours.map((hour) => hour.temp);
  const current = hours.find((hour) => hour.time.slice(0, 13) === currentHour);
  const days = input.days.flatMap((day): WeatherDayView[] => {
    const dayOffset = (Date.parse(`${day.date}T00:00:00Z`) - todayMs) / (24 * 60 * 60 * 1000);
    if (!Number.isInteger(dayOffset) || dayOffset < 0 || dayOffset >= FORECAST_DAYS) return [];
    return [{
      dayOffset,
      label: DAY_LABELS[dayOffset],
      icon: weatherIconKind(day.code),
      tempMax: day.tempMax,
      tempMin: day.tempMin,
      precip: day.precip,
    }];
  });
  if (!current && days.length === 0) return null;
  return {
    location: WEATHER_LOCATION_LABEL,
    current: current ? {temp: current.temp, label: wmoLabel(current.code), code: current.code, icon: weatherIconKind(current.code)} : undefined,
    maxPrecip: hours.length ? Math.max(...hours.map((hour) => hour.precip)) : undefined,
    tempLow: hours.length ? Math.min(...temps) : undefined,
    tempHigh: hours.length ? Math.max(...temps) : undefined,
    hours: hours.map((hour) => ({
      hourLabel: hourLabel(hour.time),
      temp: hour.temp,
      precip: hour.precip,
      label: wmoLabel(hour.code),
      icon: weatherIconKind(hour.code),
    })),
    days,
  };
}

// 温度 -> 颜色（冷蓝→暖红），让温度数字带上直观的色彩。
export function tempColor(temp: number): string {
  if (temp <= 0) return "#7cc4ff";
  if (temp <= 8) return "#69d6e0";
  if (temp <= 15) return "#7fe0a6";
  if (temp <= 21) return "#ffd95a";
  if (temp <= 27) return "#ffae4d";
  if (temp <= 32) return "#ff8a52";
  return "#ff6a5a";
}

// WMO weather code -> 图标类别
export function weatherIconKind(code: number): WeatherIconKind {
  if (code === 0 || code === 1) return "sun";
  if (code === 2) return "cloud";
  if (code === 3) return "overcast";
  if (code === 45 || code === 48) return "fog";
  if (code >= 71 && code <= 77) return "snow";
  if (code === 85 || code === 86) return "snow";
  if (code >= 95) return "thunder";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  return "cloud";
}

function hourLabel(iso: string): string {
  const match = /T(\d{2}):/.exec(iso);
  return match ? match[1] : "";
}

// WMO weather code -> 简短中文描述
export function wmoLabel(code: number): string {
  if (code === 0) return "晴";
  if (code === 1) return "少云";
  if (code === 2) return "多云";
  if (code === 3) return "阴";
  if (code === 45 || code === 48) return "雾";
  if (code >= 51 && code <= 55) return "毛毛雨";
  if (code === 56 || code === 57) return "冻雨";
  if (code === 61) return "小雨";
  if (code === 63) return "中雨";
  if (code === 65) return "大雨";
  if (code === 66 || code === 67) return "冻雨";
  if (code === 71) return "小雪";
  if (code === 73) return "中雪";
  if (code === 75) return "大雪";
  if (code === 77) return "米雪";
  if (code >= 80 && code <= 82) return "阵雨";
  if (code === 85 || code === 86) return "阵雪";
  if (code === 95) return "雷阵雨";
  if (code === 96 || code === 99) return "雷暴";
  return "—";
}
