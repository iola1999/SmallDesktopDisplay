import {FrameBackground} from "../components/frame-background.js";
import {Box, Screen, Text} from "../components/primitives.js";
import type {ClockFlipGlyphViewModel, HomeViewModel} from "../models/view-model.js";
import {autoRainRuntimeToViewModel} from "../services/auto-rain.js";
import type {ClockTheme} from "../services/clock-theme.js";
import {mixColor} from "../services/color.js";
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
      <RainBackdrop tick={model.rainTick} theme={theme} />
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

// 常驻暗背景数字雨：游戏轮播删除后留下的"活气"。纯 (seed, tick) 推导（tick 每 2 秒
// 走一格，由视图模型从墙钟算出），无持久状态。颜色从主题秒针色向背景色压暗到
// 6%-24%，垫在所有正文之下，不与时钟/天气抢对比度。
// 引擎行数(60)大于可见行数(34)：雨头有一半时间在"屏幕下方"走，等效让约半数列空闲，
// 画面稀疏；单元高度=行距(6px)，雨带连成细线而不是虚线点。
const RAIN_COLUMNS = 12;
const RAIN_ENGINE_ROWS = 60;
const RAIN_VISIBLE_ROWS = 34;

function RainBackdrop({tick, theme}: {tick: number; theme: ClockTheme}) {
  const view = autoRainRuntimeToViewModel({columns: RAIN_COLUMNS, rows: RAIN_ENGINE_ROWS, cellSize: 6, seed: "home-rain", tick});
  return (
    <>
      {view.cells
        .filter((cell) => cell.y < RAIN_VISIBLE_ROWS)
        .map((cell) => (
          <Box
            key={`${cell.x}-${cell.y}`}
            style={{
              x: 16 + cell.x * 18,
              y: 14 + cell.y * 6,
              width: 2,
              height: 6,
              backgroundColor: mixColor(theme.seconds, theme.background, cell.level >= 1 ? 0.76 : 0.86 + (1 - cell.level) * 0.08),
            }}
          />
        ))}
    </>
  );
}

// 天气摘要走居中轴线：大温度居中做主角，下面一行"天气 | 高·低"与再下面的
// 明天/后天共用同一对列中心（68 / 172），整块对成一张网格，不再四处漂。
// 地点固定是萧山，不再占一行显示。
function WeatherSummary({weather, textColor}: {weather: WeatherView; textColor: string}) {
  const today = weather.days[0];
  return (
    <>
      <Text style={{x: 60, y: 126, width: 120, height: 42, fontSize: 38, color: tempColor(weather.current.temp), alignItems: "center"}}>
        {`${weather.current.temp}°`}
      </Text>
      <WeatherIcon kind={weather.current.icon} x={34} y={162} size={18} />
      <Text style={{x: 58, y: 164, width: 60, height: 18, fontSize: 15, color: textColor}}>{weather.current.label}</Text>
      {today ? (
        <>
          <Text style={{x: 138, y: 169, width: 13, height: 13, fontSize: 11, color: LABEL_COLOR}}>高</Text>
          <Text style={{x: 151, y: 163, width: 28, height: 19, fontSize: 16, color: tempColor(today.tempMax), alignItems: "flex-end"}}>
            {`${today.tempMax}°`}
          </Text>
          <Text style={{x: 183, y: 169, width: 13, height: 13, fontSize: 11, color: LABEL_COLOR}}>低</Text>
          <Text style={{x: 196, y: 163, width: 28, height: 19, fontSize: 16, color: LOW_TEMP_COLOR, alignItems: "flex-end"}}>
            {`${today.tempMin}°`}
          </Text>
        </>
      ) : null}
    </>
  );
}

// 底部：明天 / 后天，列中心与上面的信息行对齐。
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
      <Text style={{x: center - 40, y: 190, width: 36, height: 18, fontSize: 14, color: LABEL_COLOR, alignItems: "flex-end"}}>
        {day.label}
      </Text>
      <WeatherIcon kind={day.icon} x={center + 6} y={188} size={20} />
      <Text style={{x: center - 40, y: 210, width: 36, height: 20, fontSize: 17, color: tempColor(day.tempMax), alignItems: "flex-end"}}>
        {`${day.tempMax}°`}
      </Text>
      <Text style={{x: center + 6, y: 212, width: 42, height: 18, fontSize: 14, color: LOW_TEMP_COLOR}}>
        {`/${day.tempMin}°`}
      </Text>
    </>
  );
}

// 翻页缓动（450ms ≈ 9 帧 @20fps）：旧字先停留一拍再加速离场（慢-快-慢），
// 淡出用二次方——前半段数字仍然可读，翻页过程"看得见"；新字带轻微回弹落位。
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
