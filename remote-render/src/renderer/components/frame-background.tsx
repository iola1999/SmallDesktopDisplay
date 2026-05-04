import {Box} from "./primitives.js";

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
