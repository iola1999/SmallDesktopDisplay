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

// 逐时（每 2 小时取一列，共 6 列，覆盖未来 12 小时）：小时 / 图标 / 降水% / 彩色温度。
function HourlyForecast({weather}: {weather: WeatherView}) {
  const columns = weather.hours.filter((_, index) => index % 2 === 0).slice(0, 6);
  return (
    <>
      {columns.map((hour, index) => (
        <HourColumn key={index} hour={hour} cx={16 + index * 36} />
      ))}
    </>
  );
}

function HourColumn({hour, cx}: {hour: WeatherView["hours"][number]; cx: number}) {
  return (
    <>
      <Text style={{x: cx - 4, y: 134, width: 28, height: 12, fontSize: 11, color: "#8a97a0", alignItems: "center"}}>
        {hour.hourLabel}
      </Text>
      <WeatherIcon kind={hour.icon} x={cx} y={147} />
      {hour.precip >= 20 ? (
        <Text style={{x: cx - 4, y: 168, width: 28, height: 10, fontSize: 9, color: "#5ac8fa", alignItems: "center"}}>
          {`${hour.precip}%`}
        </Text>
      ) : null}
      <Text style={{x: cx - 4, y: 178, width: 28, height: 14, fontSize: 13, color: tempColor(hour.temp), alignItems: "center"}}>
        {`${hour.temp}°`}
      </Text>
    </>
  );
}

// 明天 / 后天概览（Apple 风格行）：日 / 图标 / 降水% / 低温 — 温区色条 — 高温。
function DailyOutlook({weather}: {weather: WeatherView}) {
  const days = weather.days.slice(1, 3);
  const gmin = Math.min(...days.map((day) => day.tempMin));
  const gmax = Math.max(...days.map((day) => day.tempMax));
  return (
    <>
      {days.map((day, index) => (
        <DailyRow key={index} day={day} y={197 + index * 19} gmin={gmin} gmax={gmax} />
      ))}
    </>
  );
}

function DailyRow({day, y, gmin, gmax}: {day: WeatherDayView; y: number; gmin: number; gmax: number}) {
  const span = Math.max(1, gmax - gmin);
  const trackX = 134;
  const trackW = 60;
  const fillX = trackX + Math.round(((day.tempMin - gmin) / span) * trackW);
  const fillW = Math.max(4, Math.round(((day.tempMax - day.tempMin) / span) * trackW));
  return (
    <>
      <Text style={{x: 16, y: y + 1, width: 36, height: 16, fontSize: 14, color: "#c2ccd4"}}>{day.label}</Text>
      <WeatherIcon kind={day.icon} x={54} y={y - 1} />
      {day.precip >= 20 ? (
        <Text style={{x: 78, y: y + 4, width: 28, height: 11, fontSize: 10, color: "#5ac8fa"}}>{`${day.precip}%`}</Text>
      ) : null}
      <Text style={{x: 108, y: y + 1, width: 24, height: 16, fontSize: 13, color: tempColor(day.tempMin), alignItems: "center"}}>
        {`${day.tempMin}°`}
      </Text>
      <Box style={{x: trackX, y: y + 7, width: trackW, height: 4, borderRadius: 2, backgroundColor: "#2c333b"}} />
      <Box style={{x: fillX, y: y + 7, width: fillW, height: 4, borderRadius: 2, backgroundColor: tempColor(day.tempMax)}} />
      <Text style={{x: 200, y: y + 1, width: 26, height: 16, fontSize: 13, color: tempColor(day.tempMax), alignItems: "center"}}>
        {`${day.tempMax}°`}
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
