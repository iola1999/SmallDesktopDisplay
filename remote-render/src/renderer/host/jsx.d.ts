import type {ReactNode} from "react";
import type {Style} from "../types.js";

interface HostElementProps {
  style?: Style;
  children?: ReactNode;
}

interface HostTextProps extends HostElementProps {
  text?: string;
}

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "sdd-screen": HostElementProps;
      "sdd-box": HostElementProps;
      "sdd-text": HostTextProps;
    }
  }
}
