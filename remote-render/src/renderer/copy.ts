import type {HomeCopy} from "./types.js";

export function buildHomeCopy(currentTime: Date): HomeCopy {
  const parts = getShanghaiParts(currentTime);
  return {
    dateText: `${chineseMonth(parts.month)}月${chineseDay(parts.day)}日`,
    weekdayText: chineseWeekday(parts.weekday),
    timeText: `${pad2(parts.hour)}:${pad2(parts.minute)}`,
    secondsText: `:${pad2(parts.second)}`,
    greeting: greetingForHour(parts.hour),
    subtitle: subtitleForHour(parts.hour),
  };
}

function getShanghaiParts(date: Date): {month: number; day: number; weekday: number; hour: number; minute: number; second: number} {
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
    month: value("month"),
    day: value("day"),
    weekday: weekdayMap[parts.find((part) => part.type === "weekday")?.value ?? "Mon"] ?? 0,
    hour: value("hour"),
    minute: value("minute"),
    second: value("second"),
  };
}

function chineseMonth(month: number): string {
  return ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十", "十一", "十二"][Math.max(1, Math.min(12, month)) - 1];
}

function chineseDay(day: number): string {
  return chineseNumber(Math.max(1, Math.min(31, day)));
}

function chineseNumber(value: number): string {
  const digits = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
  if (value <= 10) return value === 10 ? "十" : digits[value];
  if (value < 20) return `十${digits[value - 10]}`;
  const tens = Math.floor(value / 10);
  const ones = value % 10;
  return ones === 0 ? `${digits[tens]}十` : `${digits[tens]}十${digits[ones]}`;
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
