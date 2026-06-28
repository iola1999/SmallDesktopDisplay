// 自包含的农历 / 二十四节气 / 传统节日推算（不引入第三方依赖）。
// 算法采用业界通用的 1900-2100 lunarInfo 查表法 + 香港天文台节气公式，
// 适用区间 1900-2100，作为时钟副标题展示足够准确。

// 每个元素编码该农历年的闰月位置与各月大小，覆盖 1900-2100。
const LUNAR_INFO = [
  0x04bd8, 0x04ae0, 0x0a570, 0x054d5, 0x0d260, 0x0d950, 0x16554, 0x056a0, 0x09ad0, 0x055d2, // 1900-1909
  0x04ae0, 0x0a5b6, 0x0a4d0, 0x0d250, 0x1d255, 0x0b540, 0x0d6a0, 0x0ada2, 0x095b0, 0x14977, // 1910-1919
  0x04970, 0x0a4b0, 0x0b4b5, 0x06a50, 0x06d40, 0x1ab54, 0x02b60, 0x09570, 0x052f2, 0x04970, // 1920-1929
  0x06566, 0x0d4a0, 0x0ea50, 0x06e95, 0x05ad0, 0x02b60, 0x186e3, 0x092e0, 0x1c8d7, 0x0c950, // 1930-1939
  0x0d4a0, 0x1d8a6, 0x0b550, 0x056a0, 0x1a5b4, 0x025d0, 0x092d0, 0x0d2b2, 0x0a950, 0x0b557, // 1940-1949
  0x06ca0, 0x0b550, 0x15355, 0x04da0, 0x0a5b0, 0x14573, 0x052b0, 0x0a9a8, 0x0e950, 0x06aa0, // 1950-1959
  0x0aea6, 0x0ab50, 0x04b60, 0x0aae4, 0x0a570, 0x05260, 0x0f263, 0x0d950, 0x05b57, 0x056a0, // 1960-1969
  0x096d0, 0x04dd5, 0x04ad0, 0x0a4d0, 0x0d4d4, 0x0d250, 0x0d558, 0x0b540, 0x0b6a0, 0x195a6, // 1970-1979
  0x095b0, 0x049b0, 0x0a974, 0x0a4b0, 0x0b27a, 0x06a50, 0x06d40, 0x0af46, 0x0ab60, 0x09570, // 1980-1989
  0x04af5, 0x04970, 0x064b0, 0x074a3, 0x0ea50, 0x06b58, 0x05ac0, 0x0ab60, 0x096d5, 0x092e0, // 1990-1999
  0x0c960, 0x0d954, 0x0d4a0, 0x0da50, 0x07552, 0x056a0, 0x0abb7, 0x025d0, 0x092d0, 0x0cab5, // 2000-2009
  0x0a950, 0x0b4a0, 0x0baa4, 0x0ad50, 0x055d9, 0x04ba0, 0x0a5b0, 0x15176, 0x052b0, 0x0a930, // 2010-2019
  0x07954, 0x06aa0, 0x0ad50, 0x05b52, 0x04b60, 0x0a6e6, 0x0a4e0, 0x0d260, 0x0ea65, 0x0d530, // 2020-2029
  0x05aa0, 0x076a3, 0x096d0, 0x04afb, 0x04ad0, 0x0a4d0, 0x1d0b6, 0x0d250, 0x0d520, 0x0dd45, // 2030-2039
  0x0b5a0, 0x056d0, 0x055b2, 0x049b0, 0x0a577, 0x0a4b0, 0x0aa50, 0x1b255, 0x06d20, 0x0ada0, // 2040-2049
  0x14b63, 0x09370, 0x049f8, 0x04970, 0x064b0, 0x168a6, 0x0ea50, 0x06b20, 0x1a6c4, 0x0aae0, // 2050-2059
  0x0a2e0, 0x0d2e3, 0x0c960, 0x0d557, 0x0d4a0, 0x0da50, 0x05d55, 0x056a0, 0x0a6d0, 0x055d4, // 2060-2069
  0x052d0, 0x0a9b8, 0x0a950, 0x0b4a0, 0x0b6a6, 0x0ad50, 0x055a0, 0x0aba4, 0x0a5b0, 0x052b0, // 2070-2079
  0x0b273, 0x06930, 0x07337, 0x06aa0, 0x0ad50, 0x14b55, 0x04b60, 0x0a570, 0x054e4, 0x0d160, // 2080-2089
  0x0e968, 0x0d520, 0x0daa0, 0x16aa6, 0x056d0, 0x04ae0, 0x0a9d4, 0x0a2d0, 0x0d150, 0x0f252, // 2090-2099
  0x0d520, // 2100
];

const SOLAR_TERM_OFFSETS = [
  0, 21208, 42467, 63836, 85337, 107014, 128867, 150921, 173149, 195551, 218072, 240693, 263343, 285989, 308563,
  331033, 353350, 375494, 397447, 419210, 440795, 462224, 483532, 504758,
];

const SOLAR_TERM_NAMES = [
  "小寒", "大寒", "立春", "雨水", "惊蛰", "春分", "清明", "谷雨", "立夏", "小满", "芒种", "夏至",
  "小暑", "大暑", "立秋", "处暑", "白露", "秋分", "寒露", "霜降", "立冬", "小雪", "大雪", "冬至",
];

// 农历采用常规汉字数字（一二三…十），与公历的阿拉伯数字形成对比。
const LUNAR_MONTH_NAMES = ["正", "二", "三", "四", "五", "六", "七", "八", "九", "十", "冬", "腊"];
const LUNAR_DAY_DIGITS = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];

const LUNAR_FESTIVALS: Record<string, string> = {
  "1-1": "春节",
  "1-15": "元宵节",
  "2-2": "龙抬头",
  "5-5": "端午节",
  "7-7": "七夕",
  "7-15": "中元节",
  "8-15": "中秋节",
  "9-9": "重阳节",
  "12-8": "腊八节",
};

const SOLAR_FESTIVALS: Record<string, string> = {
  "1-1": "元旦",
  "3-12": "植树节",
  "5-1": "劳动节",
  "6-1": "儿童节",
  "8-1": "建军节",
  "9-10": "教师节",
  "10-1": "国庆节",
};

export interface LunarDescription {
  // 例如 "五月初四"
  lunarDate: string;
  // 节日或节气（节日优先），无则为 undefined
  label?: string;
}

interface LunarDate {
  year: number;
  month: number;
  day: number;
  isLeap: boolean;
}

const MIN_YEAR = 1900;
const MAX_YEAR = 2100;

// 给定公历（上海本地）年月日，返回农历日期串与节日/节气标签。
export function describeLunarDate(year: number, month: number, day: number): LunarDescription {
  if (year < MIN_YEAR || year > MAX_YEAR) {
    return {lunarDate: ""};
  }
  const lunar = solarToLunar(year, month, day);
  const lunarDate = formatLunarMonthDay(lunar);
  return {lunarDate, label: festivalOrTerm(lunar, year, month, day)};
}

function festivalOrTerm(lunar: LunarDate, year: number, month: number, day: number): string | undefined {
  // 除夕：腊月最后一天
  if (!lunar.isLeap && lunar.month === 12 && lunar.day === monthDays(lunar.year, 12)) {
    return "除夕";
  }
  if (!lunar.isLeap) {
    const festival = LUNAR_FESTIVALS[`${lunar.month}-${lunar.day}`];
    if (festival) return festival;
  }
  const solarFestival = SOLAR_FESTIVALS[`${month}-${day}`];
  if (solarFestival) return solarFestival;
  return solarTermOn(year, month, day);
}

// 该公历日期若恰为某节气，返回节气名，否则 undefined。
function solarTermOn(year: number, month: number, day: number): string | undefined {
  for (const termIndex of [(month - 1) * 2, (month - 1) * 2 + 1]) {
    if (solarTermDay(year, termIndex) === day) {
      return SOLAR_TERM_NAMES[termIndex];
    }
  }
  return undefined;
}

function solarTermDay(year: number, termIndex: number): number {
  const ms = 31556925974.7 * (year - MIN_YEAR) + SOLAR_TERM_OFFSETS[termIndex] * 60000;
  const date = new Date(ms + Date.UTC(MIN_YEAR, 0, 6, 2, 5, 0));
  return date.getUTCDate();
}

function lunarYearDays(year: number): number {
  let sum = 348; // 12 个月 * 29 天
  for (let bit = 0x8000; bit > 0x8; bit >>= 1) {
    sum += LUNAR_INFO[year - MIN_YEAR] & bit ? 1 : 0;
  }
  return sum + leapDays(year);
}

function leapMonth(year: number): number {
  return LUNAR_INFO[year - MIN_YEAR] & 0xf;
}

function leapDays(year: number): number {
  if (leapMonth(year) === 0) return 0;
  return LUNAR_INFO[year - MIN_YEAR] & 0x10000 ? 30 : 29;
}

function monthDays(year: number, month: number): number {
  return LUNAR_INFO[year - MIN_YEAR] & (0x10000 >> month) ? 30 : 29;
}

function solarToLunar(year: number, month: number, day: number): LunarDate {
  // 基准：1900-01-31 为农历 1900 年正月初一。
  let offset = Math.round((Date.UTC(year, month - 1, day) - Date.UTC(1900, 0, 31)) / 86400000);

  let lunarYear = MIN_YEAR;
  let yearDays = 0;
  for (; lunarYear <= MAX_YEAR; lunarYear += 1) {
    yearDays = lunarYearDays(lunarYear);
    if (offset < yearDays) break;
    offset -= yearDays;
  }

  const leap = leapMonth(lunarYear);
  let isLeap = false;
  let lunarMonth = 1;
  let daysInMonth = 0;
  for (; lunarMonth < 13; lunarMonth += 1) {
    // 闰月作为额外一轮插入在第 leap 个月之后（此时 lunarMonth 临时回退到 leap）。
    if (leap > 0 && lunarMonth === leap + 1 && !isLeap) {
      lunarMonth -= 1;
      isLeap = true;
      daysInMonth = leapDays(lunarYear);
    } else {
      daysInMonth = monthDays(lunarYear, lunarMonth);
    }
    // 离开闰月时复位标记，必须在 break 之前，保证命中当天的 isLeap 正确。
    if (isLeap && lunarMonth === leap + 1) {
      isLeap = false;
    }
    if (offset < daysInMonth) break;
    offset -= daysInMonth;
  }

  return {year: lunarYear, month: lunarMonth, day: offset + 1, isLeap};
}

function formatLunarMonthDay(lunar: LunarDate): string {
  const prefix = lunar.isLeap ? "闰" : "";
  return `${prefix}${LUNAR_MONTH_NAMES[lunar.month - 1]}月${lunarDayName(lunar.day)}`;
}

function lunarDayName(day: number): string {
  if (day <= 10) return day === 10 ? "初十" : `初${LUNAR_DAY_DIGITS[day]}`;
  if (day < 20) return `十${LUNAR_DAY_DIGITS[day - 10]}`;
  if (day === 20) return "二十";
  if (day < 30) return `廿${LUNAR_DAY_DIGITS[day - 20]}`;
  return "三十";
}
