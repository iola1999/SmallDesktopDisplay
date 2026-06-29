import {THEME_MIDNIGHT, THEME_SAKURA, THEME_AMBER, THEME_MONO} from "../../ui-state.js";

// 时钟主题调色板：仅服务端渲染，切换不需要重新烧录固件。
export interface ClockTheme {
  background: string; // 卡片 / 屏幕底色
  time: string; // HH:MM 主色
  seconds: string; // 秒与强调色
  date: string; // 公历日期行
  lunar: string; // 农历副标题
}

const THEMES: Record<string, ClockTheme> = {
  // 中性深色（参考 Apple 深色天气）：干净的白与冷灰，去掉之前偏绿的色调。
  [THEME_MIDNIGHT]: {background: "#080b0f", time: "#f3f6fa", seconds: "#8fa0ad", date: "#cad3dc", lunar: "#8b96a1"},
  [THEME_SAKURA]: {background: "#0b0609", time: "#ffe6ef", seconds: "#ff9ec6", date: "#e6b6cc", lunar: "#b9889e"},
  [THEME_AMBER]: {background: "#0a0805", time: "#ffe7b8", seconds: "#ffb84d", date: "#d8c298", lunar: "#a89169"},
  [THEME_MONO]: {background: "#070708", time: "#f3f3f3", seconds: "#9aa2a2", date: "#bdbdbd", lunar: "#888c8c"},
};

export function resolveClockTheme(key: string): ClockTheme {
  return THEMES[key] ?? THEMES[THEME_MIDNIGHT];
}
