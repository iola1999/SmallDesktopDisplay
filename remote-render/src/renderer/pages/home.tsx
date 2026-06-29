import {FrameBackground} from "../components/frame-background.js";
import {Box, Screen, Text} from "../components/primitives.js";
import type {ClockFlipGlyphViewModel, HomeViewModel} from "../models/view-model.js";
import {mixColor} from "../services/color.js";
import {tempColor, type WeatherDayView, type WeatherView} from "../services/weather.js";
import {WeatherIcon} from "../widgets/weather-icon.js";

export function HomePage({model}: {model: HomeViewModel}) {
  const theme = model.theme;
  const weather = model.weather;
  return (
    <Screen fontKey={model.fontKey} backgroundColor={theme.background}>
      <FrameBackground background={theme.background} />
      {/* 顶部：左日期 + 右当前天气（图标 + 彩色温度） */}
      <Text style={{x: 16, y: 23, width: 150, height: 20, fontSize: 16, color: theme.date}}>
        {`${model.copy.dateText} ${model.copy.weekdayShort}`}
      </Text>
      {weather ? (
        <>
          <WeatherIcon kind={weather.current.icon} x={172} y={21} />
          <Text style={{x: 196, y: 23, width: 40, height: 20, fontSize: 19, color: tempColor(weather.current.temp), alignItems: "center"}}>
            {`${weather.current.temp}°`}
          </Text>
        </>
      ) : null}
      <Text style={{x: 0, y: 49, width: 240, height: 16, fontSize: 13, color: theme.lunar, alignItems: "center"}}>
        {model.copy.lunarText}
      </Text>
      {model.clockGlyphs.map((glyph) => (
        <ClockGlyph key={glyph.key} glyph={glyph} background={theme.background} />
      ))}
      {weather ? <HourlyForecast weather={weather} /> : null}
      {weather && weather.days.length >= 2 ? <DailyOutlook weather={weather} /> : null}
    </Screen>
  );
}

// 接下来几小时（逐小时，6 列）：小时 / 图标 / 彩色温度。保持紧凑，不放每小时降水%。
function HourlyForecast({weather}: {weather: WeatherView}) {
  const columns = weather.hours.slice(0, 6);
  return (
    <>
      {columns.map((hour, index) => (
        <HourColumn key={index} label={index === 0 ? "现在" : hour.hourLabel} hour={hour} cx={16 + index * 36} />
      ))}
    </>
  );
}

function HourColumn({label, hour, cx}: {label: string; hour: WeatherView["hours"][number]; cx: number}) {
  return (
    <>
      <Text style={{x: cx - 6, y: 140, width: 32, height: 12, fontSize: 11, color: "#8a97a0", alignItems: "center"}}>
        {label}
      </Text>
      <WeatherIcon kind={hour.icon} x={cx} y={154} />
      <Text style={{x: cx - 4, y: 176, width: 28, height: 14, fontSize: 14, color: tempColor(hour.temp), alignItems: "center"}}>
        {`${hour.temp}°`}
      </Text>
    </>
  );
}

// 今天最高/最低 + 明天 + 后天（三列，紧凑）：日 / 图标 / 高温·低温。不看两天之后。
function DailyOutlook({weather}: {weather: WeatherView}) {
  const days = weather.days.slice(0, 3);
  return (
    <>
      {days.map((day, index) => (
        <DailyColumn key={index} day={day} cx={12 + index * 76} />
      ))}
    </>
  );
}

function DailyColumn({day, cx}: {day: WeatherDayView; cx: number}) {
  return (
    <>
      <Text style={{x: cx + 2, y: 200, width: 36, height: 14, fontSize: 13, color: "#c2ccd4"}}>{day.label}</Text>
      <WeatherIcon kind={day.icon} x={cx + 40} y={198} />
      <Text style={{x: cx + 2, y: 218, width: 30, height: 14, fontSize: 13, color: tempColor(day.tempMax), alignItems: "center"}}>
        {`${day.tempMax}°`}
      </Text>
      <Text style={{x: cx + 34, y: 219, width: 28, height: 13, fontSize: 12, color: tempColor(day.tempMin), alignItems: "center"}}>
        {`${day.tempMin}°`}
      </Text>
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
