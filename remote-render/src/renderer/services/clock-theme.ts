import {THEME_MIDNIGHT, THEME_DUSK, THEME_SAKURA, THEME_AMBER, THEME_MONO} from "../../ui-state.js";

// 时钟主题调色板：仅服务端渲染，切换不需要重新烧录固件。
// 2026-07 重做：默认从"灰+青绿"换成石墨蓝 Ink；边框/分隔线纳入主题（此前写死青色，
// 是旧配色显脏的主要原因）。秒色同时驱动背景雨滴的色相。
export interface ClockTheme {
  background: string; // 卡片 / 屏幕底色
  time: string; // HH:MM 主色
  seconds: string; // 秒、强调色、背景雨滴色相
  date: string; // 公历日期行
  lunar: string; // 农历副标题
  border: string; // 卡片描边
  divider: string; // 时钟下分隔线
}

const THEMES: Record<string, ClockTheme> = {
  // Ink 石墨蓝（默认）：冷白 + 灰蓝，无绿味。
  [THEME_MIDNIGHT]: {background: "#090c12", time: "#eef2f8", seconds: "#7d96c8", date: "#c6cfdb", lunar: "#808b9c", border: "#2c3644", divider: "#171e2a"},
  // Dusk 暮霞：暗紫罗兰。
  [THEME_DUSK]: {background: "#0d0a14", time: "#f2ecfa", seconds: "#a68fd0", date: "#cfc4e0", lunar: "#8c7fa4", border: "#362c48", divider: "#1e182e"},
  [THEME_SAKURA]: {background: "#120a10", time: "#ffe9f1", seconds: "#e08bb0", date: "#e0b9ca", lunar: "#a67e91", border: "#422836", divider: "#221420"},
  [THEME_AMBER]: {background: "#120c05", time: "#ffeac2", seconds: "#dda45c", date: "#dcc49c", lunar: "#9a8462", border: "#423115", divider: "#231a0c"},
  [THEME_MONO]: {background: "#0a0a0b", time: "#f3f3f3", seconds: "#999fa5", date: "#c2c5c9", lunar: "#85898e", border: "#2d3033", divider: "#191b1d"},
};

export function resolveClockTheme(key: string): ClockTheme {
  return THEMES[key] ?? THEMES[THEME_MIDNIGHT];
}
