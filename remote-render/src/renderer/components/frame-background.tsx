import {Box} from "./primitives.js";

export function FrameBackground({background = "#060a0d"}: {background?: string}) {
  return (
    <>
      <Box style={{x: 8, y: 8, width: 224, height: 224, borderRadius: 14, backgroundColor: background, borderColor: "#2a3a3e", borderWidth: 2}} />
      {/* 时钟带与天气区之间唯一的分隔线（不再穿过任何文字） */}
      <Box style={{x: 24, y: 125, width: 192, height: 1, backgroundColor: "#142627"}} />
    </>
  );
}
