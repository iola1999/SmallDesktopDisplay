import {FrameBackground} from "../components/frame-background.js";
import {Box, Screen, Text} from "../components/primitives.js";
import type {ClockFlipGlyphViewModel, HomeViewModel} from "../models/view-model.js";
import {mixColor} from "../services/color.js";
import type {WeatherView} from "../services/weather.js";

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
          <Text style={{x: 150, y: 25, width: 80, height: 18, fontSize: 15, color: theme.seconds, alignItems: "center"}}>
            {`${weather.current.temp}° ${weather.current.label}`}
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

// 首页下方的 12 小时预报：每 2 小时标温度，逐时降水柱 + 整点刻度。游戏移到轮播页后，
// 这块空间用来把天气展示得更完整。
function HomeForecast({weather}: {weather: WeatherView}) {
  const baseline = 210;
  const maxBar = 32;
  return (
    <>
      <Text style={{x: 16, y: 148, width: 88, height: 14, fontSize: 12, color: "#5f8088"}}>未来 12 小时</Text>
      <Text style={{x: 118, y: 148, width: 106, height: 14, fontSize: 12, color: "#5f8088", alignItems: "center"}}>
        {`${weather.tempLow}~${weather.tempHigh}°  雨 ${weather.maxPrecip}%`}
      </Text>
      {weather.hours.map((hour, index) => (
        <ForecastColumn key={index} x={18 + index * 17} hour={hour} baseline={baseline} maxBar={maxBar} showTemp={index % 2 === 0} />
      ))}
    </>
  );
}

function ForecastColumn({
  x,
  hour,
  baseline,
  maxBar,
  showTemp,
}: {
  x: number;
  hour: WeatherView["hours"][number];
  baseline: number;
  maxBar: number;
  showTemp: boolean;
}) {
  const barHeight = Math.max(2, Math.round((hour.precip / 100) * maxBar));
  return (
    <>
      {showTemp ? (
        <Text style={{x: x - 8, y: baseline - maxBar - 14, width: 34, height: 12, fontSize: 11, color: "#cfe0d8", alignItems: "center"}}>
          {`${hour.temp}°`}
        </Text>
      ) : null}
      <Box style={{x, y: baseline - maxBar, width: 13, height: maxBar, borderRadius: 3, backgroundColor: "#0e1a20"}} />
      <Box style={{x, y: baseline - barHeight, width: 13, height: barHeight, borderRadius: 3, backgroundColor: mixColor("#1d4a5e", "#6ec8ff", hour.precip / 100)}} />
      <Text style={{x: x - 2, y: baseline + 4, width: 17, height: 12, fontSize: 10, color: "#7d949b", alignItems: "center"}}>
        {hour.hourLabel}
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
