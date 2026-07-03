// 设备偏好（主题/字体）的落盘存储：解决"容器一重建，用户选的主题就被重置"。
// 亮度不在此列——设备自己写 EEPROM，是亮度的唯一权威，服务端跟随 status 上报即可。
import {mkdirSync, readFileSync, renameSync, writeFileSync} from "node:fs";
import path from "node:path";

export interface DevicePrefs {
  themeKey?: string;
  fontKey?: string;
}

export type PrefsMap = Record<string, DevicePrefs>;

const FILE_NAME = "device-prefs.json";

export function loadPrefs(dir: string): PrefsMap {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path.join(dir, FILE_NAME), "utf8"));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    return parsed as PrefsMap;
  } catch {
    return {};
  }
}

// 防抖 + 临时文件原子替换：偏好切换可能连续发生（快速轮按主题），不必每次都写盘。
export function createPrefsSaver(dir: string, debounceMs = 300): (map: PrefsMap) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: PrefsMap | null = null;
  const flush = (): void => {
    timer = null;
    if (!pending) return;
    const snapshot = pending;
    pending = null;
    try {
      mkdirSync(dir, {recursive: true});
      const target = path.join(dir, FILE_NAME);
      const temp = `${target}.tmp`;
      writeFileSync(temp, JSON.stringify(snapshot, null, 2));
      renameSync(temp, target);
    } catch (error) {
      console.warn("[Prefs] save failed:", error instanceof Error ? error.message : error);
    }
  };
  return (map: PrefsMap) => {
    pending = structuredClone(map);
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, debounceMs);
    if (typeof timer === "object" && timer && "unref" in timer) {
      (timer as {unref?: () => void}).unref?.();
    }
  };
}
