import type {FrameRect} from "../protocol.js";

export interface CanvasImage {
  width: number;
  height: number;
  rgba: Buffer;
}

export interface RenderedFrame {
  frameId: number;
  baseFrameId: number;
  fullFrame: boolean;
  rects: FrameRect[];
}

export interface HomeCopy {
  dateText: string;
  weekdayText: string;
  weekdayShort: string;
  timeText: string;
  secondsText: string;
  greeting: string;
  subtitle: string;
  // 农历日期 + 节日/节气，例如 "五月十五" 或 "八月十五 · 中秋节"
  lunarText: string;
}

export interface Style {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  padding?: number;
  flexDirection?: "row" | "column";
  alignItems?: "center" | "flex-start" | "flex-end";
  justifyContent?: "center" | "flex-start" | "flex-end" | "space-between";
  backgroundColor?: string;
  color?: string;
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;
  fontSize?: number;
  fontFamily?: string;
  opacity?: number;
  overflow?: "hidden" | "visible";
}
