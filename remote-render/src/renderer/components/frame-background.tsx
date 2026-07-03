import {Box} from "./primitives.js";
import type {ClockTheme} from "../services/clock-theme.js";

export function FrameBackground({theme}: {theme: ClockTheme}) {
  return (
    <>
      <Box style={{x: 8, y: 8, width: 224, height: 224, borderRadius: 14, backgroundColor: theme.background, borderColor: theme.border, borderWidth: 2}} />
      {/* 时钟带与天气区之间唯一的分隔线（不再穿过任何文字） */}
      <Box style={{x: 24, y: 114, width: 192, height: 1, backgroundColor: theme.divider}} />
    </>
  );
}
