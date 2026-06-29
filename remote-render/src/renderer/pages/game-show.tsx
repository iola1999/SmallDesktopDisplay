import {Box, Screen, Text} from "../components/primitives.js";
import type {GameViewModel, HomeAmbientGameViewModel} from "../models/view-model.js";
import {AntColony} from "../widgets/ant-colony.js";
import {AutoBreakout} from "../widgets/auto-breakout.js";
import {AutoPacman} from "../widgets/auto-pacman.js";
import {AutoRain} from "../widgets/auto-rain.js";
import {AutoSnake} from "../widgets/auto-snake.js";
import {ConwayLife} from "../widgets/conway-life.js";

// 游戏轮播页：顶部一个较大的时间，其余空间放大展示当前游戏。短按切下一个，
// 播完自动回到安静首页（详见 state.ts 的 game-show 逻辑）。
export function GameShowPage({model}: {model: GameViewModel}) {
  const {width, height} = gameSize(model.game);
  const x = Math.max(8, Math.round((240 - width) / 2));
  const y = Math.max(64, Math.round(64 + (168 - height) / 2));
  return (
    <Screen fontKey={model.fontKey} backgroundColor={model.theme.background}>
      <Box style={{x: 8, y: 8, width: 224, height: 224, borderRadius: 14, backgroundColor: model.theme.background, borderColor: "#2a3a3e", borderWidth: 2}} />
      <Text style={{x: 0, y: 14, width: 240, height: 44, fontSize: 40, color: model.theme.time, alignItems: "center"}}>
        {model.timeText}
      </Text>
      <Box style={{x, y, width, height}}>
        <AmbientGame game={model.game} />
      </Box>
    </Screen>
  );
}

function AmbientGame({game}: {game: HomeAmbientGameViewModel}) {
  if (game.kind === "snake") return <AutoSnake model={game.snake} />;
  if (game.kind === "life") return <ConwayLife model={game.life} />;
  if (game.kind === "breakout") return <AutoBreakout model={game.breakout} />;
  if (game.kind === "ants") return <AntColony model={game.ants} />;
  if (game.kind === "pacman") return <AutoPacman model={game.pacman} />;
  return <AutoRain model={game.rain} />;
}

function gameSize(game: HomeAmbientGameViewModel): {width: number; height: number} {
  if (game.kind === "breakout") return {width: game.breakout.width, height: game.breakout.height};
  const grid =
    game.kind === "snake"
      ? game.snake
      : game.kind === "life"
        ? game.life
        : game.kind === "ants"
          ? game.ants
          : game.kind === "pacman"
            ? game.pacman
            : game.rain;
  return {width: grid.columns * grid.cellSize, height: grid.rows * grid.cellSize};
}
