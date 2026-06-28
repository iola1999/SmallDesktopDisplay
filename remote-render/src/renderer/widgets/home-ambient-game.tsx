import {Box} from "../components/primitives.js";
import type {HomeAmbientGameViewModel} from "../models/view-model.js";
import {AntColony} from "./ant-colony.js";
import {AutoBreakout} from "./auto-breakout.js";
import {AutoPacman} from "./auto-pacman.js";
import {AutoRain} from "./auto-rain.js";
import {AutoSnake} from "./auto-snake.js";
import {ConwayLife} from "./conway-life.js";

export function HomeAmbientGame({model}: {model: HomeAmbientGameViewModel}) {
  return (
    <Box style={{x: 24, y: 138, width: 192, height: 86}}>
      {model.kind === "snake" && <AutoSnake model={model.snake} />}
      {model.kind === "life" && <ConwayLife model={model.life} />}
      {model.kind === "breakout" && <AutoBreakout model={model.breakout} />}
      {model.kind === "ants" && <AntColony model={model.ants} />}
      {model.kind === "pacman" && <AutoPacman model={model.pacman} />}
      {model.kind === "rain" && <AutoRain model={model.rain} />}
    </Box>
  );
}
