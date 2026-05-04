import type {ClockFlipGlyphGroup, ClockFlipGlyphViewModel} from "../models/view-model.js";
import {buildHomeCopy} from "./home-copy.js";

const BIG_TIME_LAYOUT = [
  {x: 22, width: 32},
  {x: 55, width: 32},
  {x: 88, width: 16},
  {x: 106, width: 32},
  {x: 139, width: 32},
] as const;

const SECONDS_LAYOUT = [
  {x: 174, width: 10},
  {x: 187, width: 14},
  {x: 202, width: 14},
] as const;

export function buildClockFlipGlyphs(currentTime: Date, durationMs = 300): ClockFlipGlyphViewModel[] {
  const previousTime = new Date(currentTime.getTime() - 1000);
  return [
    ...buildGlyphs({
      group: "time",
      current: buildHomeCopy(currentTime).timeText,
      previous: buildHomeCopy(previousTime).timeText,
      progress: flipProgress(currentTime, durationMs),
      y: 68,
      height: 62,
      fontSize: 52,
      color: "#f0f8ee",
      layout: BIG_TIME_LAYOUT,
    }),
    ...buildGlyphs({
      group: "seconds",
      current: buildHomeCopy(currentTime).secondsText,
      previous: buildHomeCopy(previousTime).secondsText,
      progress: flipProgress(currentTime, durationMs),
      y: 92,
      height: 24,
      fontSize: 18,
      color: "#80dac6",
      layout: SECONDS_LAYOUT,
    }),
  ];
}

function buildGlyphs({
  group,
  current,
  previous,
  progress,
  y,
  height,
  fontSize,
  color,
  layout,
}: {
  group: ClockFlipGlyphGroup;
  current: string;
  previous: string;
  progress: number;
  y: number;
  height: number;
  fontSize: number;
  color: string;
  layout: readonly {x: number; width: number}[];
}): ClockFlipGlyphViewModel[] {
  return Array.from(current).map((char, index) => {
    const previousChar = Array.from(previous)[index] ?? char;
    const settled = progress >= 1 || previousChar === char;
    return {
      key: `${group}-${index}`,
      group,
      char,
      previousChar: settled ? char : previousChar,
      progress: settled ? 1 : progress,
      x: layout[index]?.x ?? 0,
      y,
      width: layout[index]?.width ?? 16,
      height,
      fontSize,
      color,
    };
  });
}

function flipProgress(currentTime: Date, durationMs: number): number {
  if (durationMs <= 0) return 1;
  return Math.min(1, Math.max(0, currentTime.getMilliseconds() / durationMs));
}
