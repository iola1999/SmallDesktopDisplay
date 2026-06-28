import {Box, Screen, Text} from "../components/primitives.js";
import type {
  BrightnessDetailViewModel,
  DetailRowViewModel,
  DetailViewModel,
  RowsDetailViewModel,
  WeatherDetailViewModel,
} from "../models/view-model.js";
import {mixColor} from "../services/color.js";
import type {WeatherView} from "../services/weather.js";

export function DetailPage({model}: {model: DetailViewModel}) {
  if (model.kind === "brightness") return <BrightnessPage model={model} />;
  if (model.kind === "weather") return <WeatherDetailPage model={model} />;
  return <RowsDetailPage model={model} />;
}

function WeatherDetailPage({model}: {model: WeatherDetailViewModel}) {
  return (
    <Screen fontKey={model.fontKey} backgroundColor="#05080a">
      <Box style={{x: 8, y: 8, width: 224, height: 224, borderRadius: 14, borderColor: "#323e48", borderWidth: 2}} />
      <Text style={{x: 20, y: 18, width: 160, height: 28, fontSize: 22, color: "#eef6ec"}}>{model.title}</Text>
      <Text style={{x: 20, y: 49, width: 200, height: 18, fontSize: 13, color: "#649baa"}}>{model.subtitle}</Text>
      {model.weather ? (
        <WeatherForecast weather={model.weather} />
      ) : (
        <Text style={{x: 0, y: 112, width: 240, height: 24, fontSize: 16, color: "#7f969c", alignItems: "center"}}>
          天气暂不可用
        </Text>
      )}
      <Text style={{x: 0, y: 210, width: 240, height: 18, fontSize: 13, color: "#a0bec2", alignItems: "center"}}>
        double tap back
      </Text>
    </Screen>
  );
}

function WeatherForecast({weather}: {weather: WeatherView}) {
  const baseline = 178;
  const maxBar = 40;
  return (
    <>
      <Text style={{x: 20, y: 72, width: 200, height: 30, fontSize: 26, color: "#eaf6ee"}}>
        {`${weather.current.temp}° ${weather.current.label}`}
      </Text>
      <Text style={{x: 20, y: 104, width: 200, height: 18, fontSize: 13, color: "#86a7b0"}}>
        {`${weather.tempLow}~${weather.tempHigh}°  最高降水 ${weather.maxPrecip}%`}
      </Text>
      {weather.hours.map((hour, index) => (
        <HourColumn key={index} x={18 + index * 17} hour={hour} baseline={baseline} maxBar={maxBar} showTemp={index % 2 === 0} />
      ))}
    </>
  );
}

function HourColumn({
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

function BrightnessPage({model}: {model: BrightnessDetailViewModel}) {
  return (
    <Screen fontKey={model.fontKey} backgroundColor="#05080a">
      <Box style={{x: 8, y: 8, width: 224, height: 224, borderRadius: 14, borderColor: "#323e48", borderWidth: 2}} />
      <Text style={{x: 20, y: 18, width: 160, height: 28, fontSize: 22, color: "#eef6ec"}}>{model.title}</Text>
      <Text style={{x: 20, y: 49, width: 180, height: 18, fontSize: 13, color: "#649baa"}}>{model.subtitle}</Text>
      <Text style={{x: 0, y: 82 - Math.round(model.pulse * 3), width: 240, height: 52, fontSize: 42, color: mixColor("#f0f8ee", "#b2ffe2", model.pulse * 0.45), alignItems: "center"}}>
        {model.valueLabel}
      </Text>
      <Box style={{x: 34, y: 146, width: 172, height: 18, borderRadius: 9, backgroundColor: "#111b20"}} />
      <Box style={{x: 35, y: 147, width: model.fillWidth, height: 16, borderRadius: 8, backgroundColor: "#70e0c4"}} />
      <Text style={{x: 34, y: 184, width: 160, height: 22, fontSize: 16, color: "#8eb2b4"}}>{model.appliedLabel}</Text>
      <Text style={{x: 0, y: 210, width: 240, height: 18, fontSize: 13, color: "#a0bec2", alignItems: "center"}}>
        double tap back
      </Text>
    </Screen>
  );
}

function RowsDetailPage({model}: {model: RowsDetailViewModel}) {
  return (
    <Screen fontKey={model.fontKey} backgroundColor="#05080a">
      <Box style={{x: 8, y: 8, width: 224, height: 224, borderRadius: 14, borderColor: "#323e48", borderWidth: 2}} />
      <Text style={{x: 20, y: 18, width: 190, height: 28, fontSize: 22, color: "#eef6ec"}}>{model.title}</Text>
      <Text style={{x: 20, y: 49, width: 190, height: 18, fontSize: 13, color: "#649baa"}}>{model.subtitle}</Text>
      {model.rows.map((row, index) => (
        <Row key={row.label} row={row} index={index} />
      ))}
      <Text style={{x: 0, y: 210, width: 240, height: 18, fontSize: 13, color: "#a0bec2", alignItems: "center"}}>
        double tap back
      </Text>
    </Screen>
  );
}

function Row({row, index}: {row: DetailRowViewModel; index: number}) {
  return (
    <>
      <Box style={{x: 18, y: 80 + index * 28, width: 204, height: 24, borderRadius: 8, backgroundColor: "#11181e"}} />
      <Text style={{x: 28, y: 84 + index * 28, width: 60, height: 18, fontSize: 13, color: "#70969e"}}>{row.label}</Text>
      <Text style={{x: 92, y: 82 + index * 28, width: 128, height: 20, fontSize: 16, color: "#e0f0e8"}}>{row.value}</Text>
    </>
  );
}
