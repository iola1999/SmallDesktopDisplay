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
  timeText: string;
  secondsText: string;
  greeting: string;
  subtitle: string;
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
}
