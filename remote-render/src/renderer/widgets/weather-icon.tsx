import {Box, Text} from "../components/primitives.js";
import {EMOJI_FONT_FAMILY, hasEmojiFont} from "../services/font-registry.js";
import type {WeatherIconKind} from "../services/weather.js";

// 天气图标：优先用彩色 emoji 字体（Noto/Apple Color Emoji，专业设计、任意缩放），
// 环境里没有 emoji 字体时回退到图元手绘（圆角矩形拼装）。
// size 为图标视觉边长，emoji 文本框按其放大约 1.3 倍以容纳字形出血。
const EMOJI: Record<WeatherIconKind, string> = {
  sun: "☀️", // ☀️
  cloud: "⛅", // ⛅ 少云
  overcast: "☁️", // ☁️
  fog: "\u{1F32B}️", // 🌫️
  rain: "\u{1F327}️", // 🌧️
  snow: "\u{1F328}️", // 🌨️
  thunder: "⛈️", // ⛈️
};

export function WeatherIcon({kind, x, y, size = 20}: {kind: WeatherIconKind; x: number; y: number; size?: number}) {
  if (hasEmojiFont()) {
    const box = Math.round(size * 1.3);
    const offset = Math.round((box - size) / 2);
    // 容器内对 Noto Color Emoji 逐像素实测（两轮）：字形墨迹中心比文本原点高约
    // 0.65×size（☀/⛈ 等字形间 ±2px 浮动）。此处下移补偿，使图标视觉中心
    // ≈ y + size/2，与同一行文字的墨迹中心对齐。
    const emojiYTrim = Math.round(size * 0.65);
    return (
      <Text
        style={{
          x: x - offset,
          y: y - offset + emojiYTrim,
          width: box,
          height: box,
          fontSize: size,
          fontFamily: EMOJI_FONT_FAMILY,
          alignItems: "center",
        }}
      >
        {EMOJI[kind]}
      </Text>
    );
  }
  return <PrimitiveWeatherIcon kind={kind} x={x} y={y} size={size} />;
}

// ---- 图元回退（无 emoji 字体的环境）----
const CLOUD = "#cdd5dd";
const CLOUD_DARK = "#9aa6b0";
const SUN = "#ffce54";
const RAINDROP = "#5ac8fa";
const BOLT = "#ffd24d";
const SNOW = "#eaf1f6";

function PrimitiveWeatherIcon({kind, x, y, size}: {kind: WeatherIconKind; x: number; y: number; size: number}) {
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
