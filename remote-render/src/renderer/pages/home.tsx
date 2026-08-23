import {FrameBackground} from "../components/frame-background.js";
import {Box, Screen, Text} from "../components/primitives.js";
import type {ClockFlipGlyphViewModel, HomeViewModel} from "../models/view-model.js";
import {tempColor, type WeatherDayView, type WeatherView} from "../services/weather.js";
import {WeatherIcon} from "../widgets/weather-icon.js";

// 低温统一用蓝灰，收敛同一行的颜色数量。
const LOW_TEMP_COLOR = "#7fb2d8";
const LABEL_COLOR = "#8a97a0";

export function HomePage({model}: {model: HomeViewModel}) {
  const theme = model.theme;
  const weather = model.weather;
  const metrics = HOME_LAYOUT_METRICS[model.config.layout];
  return (
    <Screen fontKey={model.fontKey} backgroundColor={theme.background}>
      <FrameBackground theme={theme} />
      {/* 顶行：左公历日期，右农历 */}
      {model.config.header.showDate ? (
        <Text style={{x: 16, y: metrics.headerDateY, width: 130, height: 22, fontSize: 17, color: theme.date}}>
          {`${model.copy.dateText} ${model.copy.weekdayShort}`}
        </Text>
      ) : null}
      {model.config.header.showLunar ? (
        <Text style={{x: 118, y: metrics.headerLunarY, width: 106, height: 16, fontSize: 13, color: theme.lunar, alignItems: "flex-end"}}>
          {model.copy.lunarText}
        </Text>
      ) : null}
      {model.clockGlyphs.map((glyph) => (
        <ClockGlyph key={glyph.key} glyph={glyph} background={theme.background} />
      ))}
      {weather && (model.config.weather.showCurrent || model.config.weather.showTodayRange) ? (
        <WeatherSummary
          weather={weather}
          textColor={theme.date}
          centerY={metrics.summaryCenterY}
          showCurrent={model.config.weather.showCurrent}
          showTodayRange={model.config.weather.showTodayRange}
        />
      ) : null}
      {weather && weather.days.length >= 3 && model.config.weather.showDailyOutlook ? (
        <DailyOutlook weather={weather} line1CenterY={metrics.dailyLine1CenterY} line2TopY={metrics.dailyLine2TopY} />
      ) : null}
    </Screen>
  );
}

// 天气摘要单行：左簇 = 图标 + 当前温度 + 天气描述（三者贴在一起表示"现在"），
// 右簇 = "今天" 标注 + 高/低（暖色=高、蓝灰=低）。所有元素共享同一视觉中线
// （SUMMARY_CENTER_Y），图标经实测偏移对齐文字。三字天气描述自动降一号字。
const HOME_LAYOUT_METRICS = {
  balanced: {headerDateY: 22, headerLunarY: 26, summaryCenterY: 135, dailyLine1CenterY: 177, dailyLine2TopY: 201},
  clock: {headerDateY: 22, headerLunarY: 26, summaryCenterY: 151, dailyLine1CenterY: 184, dailyLine2TopY: 207},
  weather: {headerDateY: 14, headerLunarY: 18, summaryCenterY: 101, dailyLine1CenterY: 151, dailyLine2TopY: 180},
} as const;

function WeatherSummary({
  weather,
  textColor,
  centerY,
  showCurrent,
  showTodayRange,
}: {
  weather: WeatherView;
  textColor: string;
  centerY: number;
  showCurrent: boolean;
  showTodayRange: boolean;
}) {
  const today = weather.days[0];
  const compactLabel = weather.current.label.length >= 3;
  return (
    <>
      {showCurrent ? (
        <>
          <WeatherIcon kind={weather.current.icon} x={16} y={centerY - 16} size={26} />
          <Text style={{x: 48, y: centerY - 15, width: 46, height: 30, fontSize: 25, color: tempColor(weather.current.temp)}}>
            {`${weather.current.temp}°`}
          </Text>
          <Text style={{x: 98, y: centerY - 12, width: 50, height: 24, fontSize: compactLabel ? 15 : 19, color: textColor}}>
            {weather.current.label}
          </Text>
        </>
      ) : null}
      {today && showTodayRange ? (
        <>
          <Text style={{x: 146, y: centerY - 9, width: 28, height: 18, fontSize: 13, color: LABEL_COLOR}}>今天</Text>
          <Text style={{x: 176, y: centerY - 12, width: 26, height: 23, fontSize: 17, color: tempColor(today.tempMax), alignItems: "flex-end"}}>
            {`${today.tempMax}°`}
          </Text>
          <Text style={{x: 204, y: centerY - 10, width: 6, height: 19, fontSize: 13, color: LABEL_COLOR}}>/</Text>
          <Text style={{x: 210, y: centerY - 12, width: 24, height: 23, fontSize: 17, color: LOW_TEMP_COLOR, alignItems: "flex-end"}}>
            {`${today.tempMin}°`}
          </Text>
        </>
      ) : null}
    </>
  );
}

// 底部：明天 / 后天，列中心与上面的信息行对齐。
function DailyOutlook({weather, line1CenterY, line2TopY}: {weather: WeatherView; line1CenterY: number; line2TopY: number}) {
  return (
    <>
      <DailyColumn day={weather.days[1]} center={66} line1CenterY={line1CenterY} line2TopY={line2TopY} />
      <DailyColumn day={weather.days[2]} center={174} line1CenterY={line1CenterY} line2TopY={line2TopY} />
    </>
  );
}

// 明后天列（边框移除后再放大一档）：标签 18px + 图标 28px 一行（共享中线），
// 高低温 24/18px 一行；整体下移吃掉原先浪费的底部空间（内容底缘 ~229）。
function DailyColumn({day, center, line1CenterY, line2TopY}: {day: WeatherDayView; center: number; line1CenterY: number; line2TopY: number}) {
  return (
    <>
      <Text style={{x: center - 50, y: line1CenterY - 12, width: 44, height: 24, fontSize: 18, color: LABEL_COLOR, alignItems: "flex-end"}}>
        {day.label}
      </Text>
      <WeatherIcon kind={day.icon} x={center + 4} y={line1CenterY - 17} size={28} />
      <Text style={{x: center - 50, y: line2TopY, width: 44, height: 28, fontSize: 24, color: tempColor(day.tempMax), alignItems: "flex-end"}}>
        {`${day.tempMax}°`}
      </Text>
      {/* +2：实测 18px 低温与 24px 高温的墨迹基线差 2px，上提对齐 */}
      <Text style={{x: center + 2, y: line2TopY + 2, width: 52, height: 24, fontSize: 18, color: LOW_TEMP_COLOR}}>
        {`/${day.tempMin}°`}
      </Text>
    </>
  );
}

// 翻页缓动（450ms ≈ 9 帧 @20fps）：旧字先停留一拍再加速离场（慢-快-慢），
// 淡出用二次方，前半段数字仍然可读；新字带轻微回弹落位。
function easeInOutCubic(progress: number): number {
  return progress < 0.5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2;
}

function easeOutQuad(progress: number): number {
  return 1 - (1 - progress) * (1 - progress);
}

function easeOutBack(progress: number): number {
  const overshoot = 1.1; // 峰值约多走 5%，在 ~43px 行程上是 2px 的回弹
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

  const exit = easeInOutCubic(glyph.progress);
  const enter = easeOutBack(glyph.progress);
  const travel = Math.round(glyph.height * 0.6);
  return (
    <Box style={{x: glyph.x, y: glyph.y, width: glyph.width, height: glyph.height, backgroundColor: background, overflow: "hidden"}}>
      <Text style={{...baseStyle, y: -Math.round(travel * exit), color: glyph.color, opacity: 1 - glyph.progress * glyph.progress}}>
        {glyph.previousChar}
      </Text>
      <Text style={{...baseStyle, y: Math.round(travel * (1 - enter)), color: glyph.color, opacity: 0.15 + 0.85 * easeOutQuad(glyph.progress)}}>
        {glyph.char}
      </Text>
    </Box>
  );
}
