import type {ReactNode} from "react";

import {SCREEN_HEIGHT, SCREEN_WIDTH} from "./constants.js";
import {fontFamily} from "./fonts.js";
import type {Style} from "./types.js";

export type {Style};

interface NodeProps {
  style?: Style;
  children?: ReactNode;
}

interface TextProps {
  style?: Style;
  children: string | number;
}

export function Screen({fontKey, backgroundColor, children}: {fontKey: string; backgroundColor: string; children: ReactNode}) {
  return <sdd-screen style={screenStyle(fontKey, backgroundColor)}>{children}</sdd-screen>;
}

export function Box({style, children}: NodeProps) {
  return <sdd-box style={style}>{children}</sdd-box>;
}

export function Text({style, children}: TextProps) {
  return <sdd-text style={style} text={String(children)} />;
}

export function FrameBackground() {
  return (
    <>
      <Box style={{x: 8, y: 8, width: 224, height: 224, borderRadius: 14, backgroundColor: "#060a0d", borderColor: "#2a3a3e", borderWidth: 2}} />
      <Box style={{x: 16, y: 16, width: 208, height: 208, borderRadius: 11, borderColor: "#101f22", borderWidth: 1}} />
      <Box style={{x: 32, y: 55, width: 176, height: 1, backgroundColor: "#142627"}} />
      <Box style={{x: 42, y: 132, width: 156, height: 1, backgroundColor: "#122224"}} />
    </>
  );
}

export function screenStyle(fontKey: string, backgroundColor: string): Style {
  return {width: SCREEN_WIDTH, height: SCREEN_HEIGHT, backgroundColor, fontFamily: fontFamily(fontKey)};
}
