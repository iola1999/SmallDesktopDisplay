import {Box} from "../components/primitives.js";
import type {HomeAmbientGameViewModel} from "../models/view-model.js";
import {AutoSnake} from "./auto-snake.js";
import {ConwayLife} from "./conway-life.js";

export function HomeAmbientGame({model}: {model: HomeAmbientGameViewModel}) {
  return (
    <Box style={{x: 24, y: 140, width: 192, height: 80}}>
      {model.kind === "snake" ? <AutoSnake model={model.snake} /> : <ConwayLife model={model.life} />}
    </Box>
  );
}
