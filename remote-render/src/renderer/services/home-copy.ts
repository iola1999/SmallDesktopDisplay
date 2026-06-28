import type {HomeCopy} from "../types.js";
import {describeLunarDate} from "./lunar.js";

export function buildHomeCopy(currentTime: Date): HomeCopy {
  const parts = getShanghaiParts(currentTime);
  const lunar = describeLunarDate(parts.year, parts.month, parts.day);
  return {
    dateText: `${parts.month}月${parts.day}日`,
    weekdayText: chineseWeekday(parts.weekday),
    timeText: `${pad2(parts.hour)}:${pad2(parts.minute)}`,
    secondsText: `:${pad2(parts.second)}`,
    greeting: greetingForHour(parts.hour),
    subtitle: subtitleForHour(parts.hour),
    lunarText: lunar.label ? `${lunar.lunarDate} · ${lunar.label}` : lunar.lunarDate,
  };
}

function getShanghaiParts(date: Date): {year: number; month: number; day: number; weekday: number; hour: number; minute: number; second: number} {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
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
