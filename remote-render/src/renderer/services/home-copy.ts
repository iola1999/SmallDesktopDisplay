import type {HomeCopy} from "../types.js";
import {describeLunarDate} from "./lunar.js";

// Intl.DateTimeFormat 构造相当昂贵（~25µs），而首页每帧要为当前秒与前一秒各算一次文案，
// 峰值 20fps。formatter 固定不变，提为模块级；文案本身按 epoch 秒做双槽缓存
// （当前秒 + 前一秒），翻页动画期间全部命中。
const SHANGHAI_FORMAT = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

const copyCache = new Map<number, HomeCopy>();

export function buildHomeCopy(currentTime: Date): HomeCopy {
  const second = Math.floor(currentTime.getTime() / 1000);
  const cached = copyCache.get(second);
  if (cached) {
    return cached;
  }
  const parts = getShanghaiParts(currentTime);
  const lunar = describeLunarDate(parts.year, parts.month, parts.day);
  const copy: HomeCopy = {
    dateText: `${parts.month}月${parts.day}日`,
    weekdayText: chineseWeekday(parts.weekday),
    weekdayShort: chineseWeekdayShort(parts.weekday),
    timeText: `${pad2(parts.hour)}:${pad2(parts.minute)}`,
    secondsText: `:${pad2(parts.second)}`,
    greeting: greetingForHour(parts.hour),
    subtitle: subtitleForHour(parts.hour),
    lunarText: lunar.label ? `${lunar.lunarDate} · ${lunar.label}` : lunar.lunarDate,
  };
  copyCache.set(second, copy);
  // 只保留最近两秒（当前 + 翻页动画的前一秒），防止长期运行累积。
  if (copyCache.size > 2) {
    for (const key of copyCache.keys()) {
      if (copyCache.size <= 2) break;
      if (key !== second) copyCache.delete(key);
    }
  }
  return copy;
}

function getShanghaiParts(date: Date): {year: number; month: number; day: number; weekday: number; hour: number; minute: number; second: number} {
  const parts = SHANGHAI_FORMAT.formatToParts(date);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  const weekdayMap: Record<string, number> = {Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6};
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    weekday: weekdayMap[parts.find((part) => part.type === "weekday")?.value ?? "Mon"] ?? 0,
    hour: value("hour"),
    minute: value("minute"),
    second: value("second"),
  };
}

function chineseWeekday(weekday: number): string {
  return ["星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日"][Math.max(0, Math.min(6, weekday))];
}

function chineseWeekdayShort(weekday: number): string {
  return ["周一", "周二", "周三", "周四", "周五", "周六", "周日"][Math.max(0, Math.min(6, weekday))];
}

function greetingForHour(hour: number): string {
  if (hour >= 5 && hour < 11) return "早上好";
  if (hour >= 11 && hour < 14) return "中午好";
  if (hour >= 14 && hour < 18) return "下午好";
  if (hour >= 18 && hour < 23) return "晚上好";
  return "夜深了";
}

function subtitleForHour(hour: number): string {
  if (hour >= 5 && hour < 11) return "今天也慢慢开始";
  if (hour >= 11 && hour < 14) return "记得好好吃饭";
  if (hour >= 14 && hour < 18) return "保持清醒，慢慢来";
  if (hour >= 18 && hour < 23) return "收一收，缓一缓";
  return "早点休息也很好";
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}
