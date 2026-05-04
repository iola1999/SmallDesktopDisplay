import type {ReactNode} from "react";

import {SCREEN_HEIGHT, SCREEN_WIDTH} from "../constants.js";
import {fontFamily} from "../services/font-registry.js";
import type {Style} from "../types.js";

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

export function screenStyle(fontKey: string, backgroundColor: string): Style {
  return {width: SCREEN_WIDTH, height: SCREEN_HEIGHT, backgroundColor, fontFamily: fontFamily(fontKey)};
}
