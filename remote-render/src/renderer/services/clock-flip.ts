import type {HomeLayout} from "../../config/schema.js";
import type {ClockFlipGlyphGroup, ClockFlipGlyphViewModel} from "../models/view-model.js";
import {buildHomeCopy} from "./home-copy.js";

const BIG_TIME_LAYOUT = [
  {x: 24, width: 34},
  {x: 59, width: 34},
  {x: 93, width: 15},
  {x: 110, width: 34},
  {x: 145, width: 34},
] as const;

const SECONDS_LAYOUT = [
  {x: 184, width: 9},
  {x: 194, width: 13},
  {x: 208, width: 13},
] as const;

export interface BuildClockFlipGlyphsOptions {
  durationMs?: number;
  progress?: number;
  timeColor?: string;
  secondsColor?: string;
  layout?: HomeLayout;
}

export function buildClockFlipGlyphs(currentTime: Date, options: BuildClockFlipGlyphsOptions = {}): ClockFlipGlyphViewModel[] {
  const previousTime = new Date(currentTime.getTime() - 1000);
  const progress = options.progress ?? flipProgress(currentTime, options.durationMs ?? 450);
  const metrics = clockMetrics(options.layout ?? "balanced");
  return [
    ...buildGlyphs({
      group: "time",
      current: buildHomeCopy(currentTime).timeText,
      previous: buildHomeCopy(previousTime).timeText,
      progress,
      y: metrics.timeY,
      height: metrics.timeHeight,
      fontSize: metrics.timeFontSize,
      color: options.timeColor ?? "#f0f8ee",
      layout: BIG_TIME_LAYOUT,
    }),
    ...buildGlyphs({
      group: "seconds",
      current: buildHomeCopy(currentTime).secondsText,
      previous: buildHomeCopy(previousTime).secondsText,
      progress,
      y: metrics.secondsY,
      height: metrics.secondsHeight,
      fontSize: metrics.secondsFontSize,
      color: options.secondsColor ?? "#80dac6",
      layout: SECONDS_LAYOUT,
    }),
  ];
}

function clockMetrics(layout: HomeLayout): {
  timeY: number;
  timeHeight: number;
  timeFontSize: number;
  secondsY: number;
  secondsHeight: number;
  secondsFontSize: number;
} {
  if (layout === "clock") {
    return {timeY: 66, timeHeight: 66, timeFontSize: 58, secondsY: 94, secondsHeight: 28, secondsFontSize: 21};
  }
  if (layout === "weather") {
    return {timeY: 38, timeHeight: 50, timeFontSize: 44, secondsY: 57, secondsHeight: 24, secondsFontSize: 18};
  }
  return {timeY: 48, timeHeight: 60, timeFontSize: 54, secondsY: 74, secondsHeight: 26, secondsFontSize: 20};
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
