import {FrameBackground} from "../components/frame-background.js";
import {Box, Screen, Text} from "../components/primitives.js";
import type {ClockFlipGlyphViewModel, HomeViewModel} from "../models/view-model.js";
import {mixColor} from "../services/color.js";
import type {WeatherView} from "../services/weather.js";
import {HomeAmbientGame} from "../widgets/home-ambient-game.js";

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
      {weather ? <HomeForecastStrip weather={weather} /> : null}
      <HomeAmbientGame model={model.game} />
    </Screen>
  );
}

// 时钟与游戏之间的细窄 12 小时降水趋势条：每小时一根柱，高度/亮度随降水概率变化。
function HomeForecastStrip({weather}: {weather: WeatherView}) {
  const baseline = 144;
  const maxBar = 12;
  return (
    <>
      {weather.hours.map((hour, index) => {
        const height = Math.max(1, Math.round((hour.precip / 100) * maxBar));
        return (
          <Box
            key={index}
            style={{
              x: 20 + index * 17,
              y: baseline - height,
              width: 13,
              height,
              borderRadius: 1,
              backgroundColor: mixColor("#264a52", "#7ccbff", hour.precip / 100),
              opacity: 0.45 + (hour.precip / 100) * 0.55,
            }}
          />
        );
      })}
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
