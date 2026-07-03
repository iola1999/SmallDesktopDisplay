import {FrameBackground} from "../components/frame-background.js";
import {Box, Screen, Text} from "../components/primitives.js";
import type {ClockFlipGlyphViewModel, HomeViewModel} from "../models/view-model.js";
import {tempColor, type WeatherDayView, type WeatherView} from "../services/weather.js";
import {WeatherIcon} from "../widgets/weather-icon.js";

// 低温统一用蓝灰而不是 tempColor，避免出现一排彩虹数字。
const LOW_TEMP_COLOR = "#7fb2d8";
const LABEL_COLOR = "#8a97a0";

export function HomePage({model}: {model: HomeViewModel}) {
  const theme = model.theme;
  const weather = model.weather;
  return (
    <Screen fontKey={model.fontKey} backgroundColor={theme.background}>
      <FrameBackground background={theme.background} />
      {/* 顶行：左公历日期，右农历 */}
      <Text style={{x: 16, y: 22, width: 130, height: 22, fontSize: 17, color: theme.date}}>
        {`${model.copy.dateText} ${model.copy.weekdayShort}`}
      </Text>
      <Text style={{x: 118, y: 26, width: 106, height: 16, fontSize: 13, color: theme.lunar, alignItems: "flex-end"}}>
        {model.copy.lunarText}
      </Text>
      {model.clockGlyphs.map((glyph) => (
        <ClockGlyph key={glyph.key} glyph={glyph} background={theme.background} />
      ))}
      {weather ? <WeatherSummary weather={weather} textColor={theme.date} /> : null}
      {weather && weather.days.length >= 3 ? <DailyOutlook weather={weather} /> : null}
    </Screen>
  );
}

// 参考 Apple 天气列表卡的摘要：左上地点 / 右上大温度 / 左下图标+天气 / 右下 高·低。
// 不再显示逐小时明细——摘要 + 明天后天就够一眼读完。
function WeatherSummary({weather, textColor}: {weather: WeatherView; textColor: string}) {
  const today = weather.days[0];
  return (
    <>
      <Text style={{x: 24, y: 132, width: 90, height: 18, fontSize: 14, color: LABEL_COLOR}}>{weather.location}</Text>
      <Text style={{x: 136, y: 128, width: 88, height: 38, fontSize: 36, color: tempColor(weather.current.temp), alignItems: "flex-end"}}>
        {`${weather.current.temp}°`}
      </Text>
      <WeatherIcon kind={weather.current.icon} x={24} y={158} size={22} />
      <Text style={{x: 52, y: 160, width: 66, height: 20, fontSize: 16, color: textColor}}>{weather.current.label}</Text>
      {today ? (
        <>
          <Text style={{x: 136, y: 165, width: 13, height: 14, fontSize: 11, color: LABEL_COLOR}}>高</Text>
          <Text style={{x: 150, y: 160, width: 32, height: 20, fontSize: 17, color: tempColor(today.tempMax), alignItems: "flex-end"}}>
            {`${today.tempMax}°`}
          </Text>
          <Text style={{x: 186, y: 165, width: 13, height: 14, fontSize: 11, color: LABEL_COLOR}}>低</Text>
          <Text style={{x: 198, y: 160, width: 26, height: 20, fontSize: 17, color: LOW_TEMP_COLOR, alignItems: "flex-end"}}>
            {`${today.tempMin}°`}
          </Text>
        </>
      ) : null}
    </>
  );
}

// 底部：明天 / 后天，各占半屏两行（标签+图标 / 高低温）。
function DailyOutlook({weather}: {weather: WeatherView}) {
  return (
    <>
      <DailyColumn day={weather.days[1]} center={68} />
      <DailyColumn day={weather.days[2]} center={172} />
    </>
  );
}

function DailyColumn({day, center}: {day: WeatherDayView; center: number}) {
  return (
    <>
      <Text style={{x: center - 40, y: 188, width: 36, height: 18, fontSize: 14, color: LABEL_COLOR, alignItems: "flex-end"}}>
        {day.label}
      </Text>
      <WeatherIcon kind={day.icon} x={center + 6} y={186} size={20} />
      <Text style={{x: center - 40, y: 208, width: 36, height: 20, fontSize: 17, color: tempColor(day.tempMax), alignItems: "flex-end"}}>
        {`${day.tempMax}°`}
      </Text>
      <Text style={{x: center + 6, y: 210, width: 42, height: 18, fontSize: 14, color: LOW_TEMP_COLOR}}>
        {`/${day.tempMin}°`}
      </Text>
    </>
  );
}

// 翻页缓动：旧字快出（三次方缓出），新字带一点回弹落位，观感比线性平移更"翻页"。
function easeOutCubic(progress: number): number {
  return 1 - Math.pow(1 - progress, 3);
}

function easeOutBack(progress: number): number {
  const overshoot = 0.8; // 峰值约多走 3.5%，在 40px 行程上是 ~1.5px 的轻微回弹
  const cubic = overshoot + 1;
  return 1 + cubic * Math.pow(progress - 1, 3) + overshoot * Math.pow(progress - 1, 2);
}

function ClockGlyph({glyph, background}: {glyph: ClockFlipGlyphViewModel; background: string}) {
  const baseStyle = {x: 0, width: glyph.width, height: glyph.height, fontSize: glyph.fontSize, alignItems: "center"} as const;
  if (glyph.previousChar === glyph.char) {
    return (
      <Text style={{x: glyph.x, y: glyph.y, width: glyph.width, height: glyph.height, fontSize: glyph.fontSize, color: glyph.color, alignItems: "center"}}>
        {glyph.char}
      </Text>
    );
  }

  const exit = easeOutCubic(glyph.progress);
  const enter = easeOutBack(glyph.progress);
  const travel = Math.round(glyph.height * 0.55);
  return (
    <Box style={{x: glyph.x, y: glyph.y, width: glyph.width, height: glyph.height, backgroundColor: background, overflow: "hidden"}}>
      <Text style={{...baseStyle, y: -Math.round(travel * exit), color: glyph.color, opacity: Math.max(0, 1 - glyph.progress * 1.4)}}>
        {glyph.previousChar}
      </Text>
      <Text style={{...baseStyle, y: Math.round(travel * (1 - enter)), color: glyph.color, opacity: 0.3 + 0.7 * exit}}>
        {glyph.char}
      </Text>
    </Box>
  );
}
