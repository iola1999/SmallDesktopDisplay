import {FrameBackground} from "../components/frame-background.js";
import {Box, Screen, Text} from "../components/primitives.js";
import type {ClockFlipGlyphViewModel, HomeViewModel} from "../models/view-model.js";
import {mixColor} from "../services/color.js";
import {tempColor, type WeatherDayView, type WeatherView} from "../services/weather.js";
import {WeatherIcon} from "../widgets/weather-icon.js";

// 低温统一用蓝灰而不是 tempColor，避免底部出现一排彩虹数字。
const LOW_TEMP_COLOR = "#7fb2d8";
const LABEL_COLOR = "#8a97a0";
const MUTED_COLOR = "#8b96a1";

export function HomePage({model}: {model: HomeViewModel}) {
  const theme = model.theme;
  const weather = model.weather;
  return (
    <Screen fontKey={model.fontKey} backgroundColor={theme.background}>
      <FrameBackground background={theme.background} />
      {/* 顶行：左公历日期，右农历（不再单起一行，也不再有穿字分隔线） */}
      <Text style={{x: 16, y: 22, width: 130, height: 22, fontSize: 17, color: theme.date}}>
        {`${model.copy.dateText} ${model.copy.weekdayShort}`}
      </Text>
      <Text style={{x: 118, y: 26, width: 106, height: 16, fontSize: 13, color: theme.lunar, alignItems: "flex-end"}}>
        {model.copy.lunarText}
      </Text>
      {model.clockGlyphs.map((glyph) => (
        <ClockGlyph key={glyph.key} glyph={glyph} background={theme.background} />
      ))}
      {weather ? <CurrentConditions weather={weather} theme={{text: theme.date}} /> : null}
      {weather ? <HourlyForecast weather={weather} /> : null}
      {weather && weather.days.length >= 3 ? <DailyOutlook weather={weather} /> : null}
    </Screen>
  );
}

// 当前状态条：整个首页唯一一处"现在"（图标 + 描述 + 温度 | 今天高低温）。
function CurrentConditions({weather, theme}: {weather: WeatherView; theme: {text: string}}) {
  const today = weather.days[0];
  return (
    <>
      <WeatherIcon kind={weather.current.icon} x={20} y={130} size={26} />
      <Text style={{x: 52, y: 136, width: 48, height: 18, fontSize: 15, color: theme.text}}>{weather.current.label}</Text>
      <Text style={{x: 102, y: 130, width: 46, height: 24, fontSize: 21, color: tempColor(weather.current.temp)}}>
        {`${weather.current.temp}°`}
      </Text>
      {today ? (
        <>
          <Text style={{x: 140, y: 138, width: 26, height: 14, fontSize: 12, color: LABEL_COLOR}}>今天</Text>
          <Text style={{x: 168, y: 134, width: 26, height: 18, fontSize: 15, color: tempColor(today.tempMax), alignItems: "flex-end"}}>
            {`${today.tempMax}°`}
          </Text>
          <Text style={{x: 195, y: 136, width: 6, height: 16, fontSize: 13, color: MUTED_COLOR}}>/</Text>
          <Text style={{x: 201, y: 134, width: 22, height: 18, fontSize: 15, color: LOW_TEMP_COLOR}}>{`${today.tempMin}°`}</Text>
        </>
      ) : null}
    </>
  );
}

// 未来 5 小时（从下一小时开始，"现在"已由当前条呈现）：小时 / 图标 / 彩色温度。
function HourlyForecast({weather}: {weather: WeatherView}) {
  const columns = weather.hours.slice(1, 6);
  return (
    <>
      {columns.map((hour, index) => (
        <HourColumn key={index} hour={hour} cx={36 + index * 42} />
      ))}
    </>
  );
}

function HourColumn({hour, cx}: {hour: WeatherView["hours"][number]; cx: number}) {
  return (
    <>
      <Text style={{x: cx - 21, y: 162, width: 42, height: 16, fontSize: 13, color: LABEL_COLOR, alignItems: "center"}}>
        {`${hour.hourLabel}时`}
      </Text>
      <WeatherIcon kind={hour.icon} x={cx - 12} y={178} size={24} />
      <Text style={{x: cx - 21, y: 204, width: 42, height: 20, fontSize: 17, color: tempColor(hour.temp), alignItems: "center"}}>
        {`${hour.temp}°`}
      </Text>
    </>
  );
}

// 底行：明天 / 后天，各占半屏（今天的高低温已并入当前条）。
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
      <Text style={{x: center - 42, y: 219, width: 24, height: 13, fontSize: 11, color: LABEL_COLOR}}>{day.label}</Text>
      <WeatherIcon kind={day.icon} x={center - 16} y={218} size={13} />
      <Text style={{x: center + 1, y: 217, width: 22, height: 15, fontSize: 14, color: tempColor(day.tempMax)}}>
        {`${day.tempMax}°`}
      </Text>
      <Text style={{x: center + 24, y: 218, width: 28, height: 14, fontSize: 12, color: MUTED_COLOR}}>{`/${day.tempMin}°`}</Text>
    </>
  );
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

  const eased = glyph.progress;
  const travel = glyph.height * 0.5;
  const muted = mixColor(glyph.color, background, 0.72);
  return (
    <Box style={{x: glyph.x, y: glyph.y, width: glyph.width, height: glyph.height, backgroundColor: background, overflow: "hidden"}}>
      <Text style={{...baseStyle, y: -Math.round(travel * eased), color: mixColor(glyph.color, muted, eased), opacity: 1 - eased * 0.35}}>
        {glyph.previousChar}
      </Text>
      <Text style={{...baseStyle, y: Math.round(travel * (1 - eased)), color: mixColor(muted, glyph.color, eased), opacity: 0.35 + eased * 0.65}}>
        {glyph.char}
      </Text>
    </Box>
  );
}
