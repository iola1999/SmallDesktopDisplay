import {FrameBackground} from "../components/frame-background.js";
import {Box, Screen, Text} from "../components/primitives.js";
import type {ClockFlipGlyphViewModel, HomeViewModel} from "../models/view-model.js";
import {mixColor} from "../services/color.js";
import type {WeatherView} from "../services/weather.js";
import {WeatherIcon} from "../widgets/weather-icon.js";

export function HomePage({model}: {model: HomeViewModel}) {
  const theme = model.theme;
  const weather = model.weather;
  return (
    <Screen fontKey={model.fontKey} backgroundColor={theme.background}>
      <FrameBackground background={theme.background} />
      {weather ? (
        <>
          <Text style={{x: 12, y: 23, width: 150, height: 22, fontSize: 18, color: theme.date, alignItems: "center"}}>
            {`${model.copy.dateText} ${model.copy.weekdayShort}`}
          </Text>
          <WeatherIcon kind={weather.current.icon} x={138} y={22} />
          <Text style={{x: 160, y: 25, width: 70, height: 18, fontSize: 16, color: "#eef2f6", alignItems: "center"}}>
            {`${weather.current.temp}°`}
          </Text>
        </>
      ) : (
        <Text style={{x: 0, y: 23, width: 240, height: 24, fontSize: 20, color: theme.date, alignItems: "center"}}>
          {`${model.copy.dateText}  ${model.copy.weekdayText}`}
        </Text>
      )}
      <Text style={{x: 0, y: 49, width: 240, height: 16, fontSize: 13, color: theme.lunar, alignItems: "center"}}>
        {model.copy.lunarText}
      </Text>
      {model.clockGlyphs.map((glyph) => (
        <ClockGlyph key={glyph.key} glyph={glyph} background={theme.background} />
      ))}
      {weather ? <HomeForecast weather={weather} /> : null}
    </Screen>
  );
}

// 首页下方的逐时天气（Apple 风格）：取未来 12 小时里每隔 2 小时的 6 个时刻，
// 每列从上到下是「小时 / 图标 / 降水概率 / 温度」，同一列同属一个小时，一眼对得上。
function HomeForecast({weather}: {weather: WeatherView}) {
  const columns = weather.hours.filter((_, index) => index % 2 === 0).slice(0, 6);
  return (
    <>
      {columns.map((hour, index) => (
        <ForecastColumn key={index} hour={hour} cx={16 + index * 36} />
      ))}
    </>
  );
}

function ForecastColumn({hour, cx}: {hour: WeatherView["hours"][number]; cx: number}) {
  return (
    <>
      <Text style={{x: cx - 4, y: 150, width: 28, height: 12, fontSize: 11, color: "#8a97a0", alignItems: "center"}}>
        {hour.hourLabel}
      </Text>
      <WeatherIcon kind={hour.icon} x={cx} y={164} />
      {hour.precip >= 20 ? (
        <Text style={{x: cx - 4, y: 188, width: 28, height: 11, fontSize: 10, color: "#5ac8fa", alignItems: "center"}}>
          {`${hour.precip}%`}
        </Text>
      ) : null}
      <Text style={{x: cx - 4, y: 201, width: 28, height: 16, fontSize: 14, color: "#eef2f6", alignItems: "center"}}>
        {`${hour.temp}°`}
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
