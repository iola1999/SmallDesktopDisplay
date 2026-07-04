import {Box} from "./primitives.js";
import type {ClockTheme} from "../services/clock-theme.js";

export function FrameBackground({theme}: {theme: ClockTheme}) {
  // 边框圈已移除（2026-07-04 用户反馈占空间）：内容区直接用满 240px，
  // 只保留时钟带与天气区之间的一条分隔线（不穿过任何文字）。
  return <Box style={{x: 16, y: 114, width: 208, height: 1, backgroundColor: theme.divider}} />;
}
