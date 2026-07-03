import {Box} from "../components/primitives.js";
import type {WeatherIconKind} from "../services/weather.js";

// 用基本图元拼出的小天气图标，绝对定位在屏幕坐标 x,y。
// size 为图标边长（默认 20，坐标按 20 基准等比缩放取整）。
const CLOUD = "#cdd5dd";
const CLOUD_DARK = "#9aa6b0";
const SUN = "#ffce54";
const RAINDROP = "#5ac8fa";
const BOLT = "#ffd24d";
const SNOW = "#eaf1f6";

export function WeatherIcon({kind, x, y, size = 20}: {kind: WeatherIconKind; x: number; y: number; size?: number}) {
  const px = (value: number) => Math.round((value * size) / 20);
  if (kind === "sun") {
    return <Box style={{x: x + px(4), y: y + px(4), width: px(12), height: px(12), borderRadius: px(6), backgroundColor: SUN}} />;
  }
  if (kind === "fog") {
    return (
      <>
        <Box style={{x: x + px(2), y: y + px(5), width: px(16), height: Math.max(1, px(2)), borderRadius: px(1), backgroundColor: CLOUD}} />
        <Box style={{x: x + px(2), y: y + px(10), width: px(16), height: Math.max(1, px(2)), borderRadius: px(1), backgroundColor: CLOUD_DARK}} />
        <Box style={{x: x + px(4), y: y + px(15), width: px(12), height: Math.max(1, px(2)), borderRadius: px(1), backgroundColor: CLOUD}} />
      </>
    );
  }
  const color = kind === "overcast" ? CLOUD_DARK : CLOUD;
  return (
    <>
      <Box style={{x: x + px(1), y: y + px(6), width: px(18), height: px(8), borderRadius: px(4), backgroundColor: color}} />
      <Box style={{x: x + px(4), y: y + px(2), width: px(9), height: px(9), borderRadius: px(5), backgroundColor: color}} />
      <Box style={{x: x + px(9), y: y + px(4), width: px(7), height: px(7), borderRadius: px(4), backgroundColor: color}} />
      {kind === "rain" ? (
        <>
          <Box style={{x: x + px(5), y: y + px(15), width: Math.max(1, px(2)), height: px(4), borderRadius: px(1), backgroundColor: RAINDROP}} />
          <Box style={{x: x + px(9), y: y + px(15), width: Math.max(1, px(2)), height: px(4), borderRadius: px(1), backgroundColor: RAINDROP}} />
          <Box style={{x: x + px(13), y: y + px(15), width: Math.max(1, px(2)), height: px(4), borderRadius: px(1), backgroundColor: RAINDROP}} />
        </>
      ) : null}
      {kind === "thunder" ? (
        <Box style={{x: x + px(8), y: y + px(14), width: Math.max(1, px(3)), height: px(6), borderRadius: px(1), backgroundColor: BOLT}} />
      ) : null}
      {kind === "snow" ? (
        <>
          <Box style={{x: x + px(5), y: y + px(15), width: Math.max(1, px(3)), height: Math.max(1, px(3)), borderRadius: px(2), backgroundColor: SNOW}} />
          <Box style={{x: x + px(11), y: y + px(16), width: Math.max(1, px(3)), height: Math.max(1, px(3)), borderRadius: px(2), backgroundColor: SNOW}} />
        </>
      ) : null}
    </>
  );
}
