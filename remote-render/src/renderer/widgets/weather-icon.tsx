import {Box} from "../components/primitives.js";
import type {WeatherIconKind} from "../services/weather.js";

// 用基本图元拼出的小天气图标（约 20x20，绝对定位在屏幕坐标 x,y）。
const CLOUD = "#cdd5dd";
const CLOUD_DARK = "#9aa6b0";
const SUN = "#ffce54";
const RAINDROP = "#5ac8fa";
const BOLT = "#ffd24d";
const SNOW = "#eaf1f6";

export function WeatherIcon({kind, x, y}: {kind: WeatherIconKind; x: number; y: number}) {
  if (kind === "sun") {
    return <Box style={{x: x + 4, y: y + 4, width: 12, height: 12, borderRadius: 6, backgroundColor: SUN}} />;
  }
  if (kind === "fog") {
    return (
      <>
        <Box style={{x: x + 2, y: y + 5, width: 16, height: 2, borderRadius: 1, backgroundColor: CLOUD}} />
        <Box style={{x: x + 2, y: y + 10, width: 16, height: 2, borderRadius: 1, backgroundColor: CLOUD_DARK}} />
        <Box style={{x: x + 4, y: y + 15, width: 12, height: 2, borderRadius: 1, backgroundColor: CLOUD}} />
      </>
    );
  }
  const color = kind === "overcast" ? CLOUD_DARK : CLOUD;
  return (
    <>
      <Box style={{x: x + 1, y: y + 6, width: 18, height: 8, borderRadius: 4, backgroundColor: color}} />
      <Box style={{x: x + 4, y: y + 2, width: 9, height: 9, borderRadius: 5, backgroundColor: color}} />
      <Box style={{x: x + 9, y: y + 4, width: 7, height: 7, borderRadius: 4, backgroundColor: color}} />
      {kind === "rain" ? (
        <>
          <Box style={{x: x + 5, y: y + 15, width: 2, height: 4, borderRadius: 1, backgroundColor: RAINDROP}} />
          <Box style={{x: x + 9, y: y + 15, width: 2, height: 4, borderRadius: 1, backgroundColor: RAINDROP}} />
          <Box style={{x: x + 13, y: y + 15, width: 2, height: 4, borderRadius: 1, backgroundColor: RAINDROP}} />
        </>
      ) : null}
      {kind === "thunder" ? <Box style={{x: x + 8, y: y + 14, width: 3, height: 6, borderRadius: 1, backgroundColor: BOLT}} /> : null}
      {kind === "snow" ? (
        <>
          <Box style={{x: x + 5, y: y + 15, width: 3, height: 3, borderRadius: 2, backgroundColor: SNOW}} />
          <Box style={{x: x + 11, y: y + 16, width: 3, height: 3, borderRadius: 2, backgroundColor: SNOW}} />
        </>
      ) : null}
    </>
  );
}
