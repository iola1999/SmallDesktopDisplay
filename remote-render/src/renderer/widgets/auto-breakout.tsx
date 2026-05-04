import {Box} from "../components/primitives.js";
import type {AutoBreakoutViewModel, BreakoutBallViewModel, BreakoutBrickViewModel, BreakoutDropViewModel} from "../models/view-model.js";

export function AutoBreakout({model}: {model: AutoBreakoutViewModel}) {
  return (
    <Box style={{width: model.width, height: model.height, borderColor: "#12312d", borderWidth: 1, borderRadius: 4, backgroundColor: "#06100f"}}>
      {model.bricks.map((brick, index) => (
        <Brick key={`brick-${index}-${brick.strength}`} brick={brick} />
      ))}
      {model.drops.map((drop, index) => (
        <Drop key={`drop-${index}`} drop={drop} />
      ))}
      {model.balls.map((ball, index) => (
        <Ball key={`ball-${index}`} ball={ball} />
      ))}
      <Box
        style={{
          x: model.paddle.x,
          y: model.paddle.y,
          width: model.paddle.width,
          height: model.paddle.height,
          borderRadius: 2,
          backgroundColor: "#d7fff7",
        }}
      />
    </Box>
  );
}

function Brick({brick}: {brick: BreakoutBrickViewModel}) {
  return (
    <Box
      style={{
        x: brick.x,
        y: brick.y,
        width: brick.width,
        height: brick.height,
        borderRadius: 1,
        backgroundColor: brick.strength > 1 ? "#9af0df" : "#3aa895",
        opacity: brick.strength > 1 ? 0.86 : 0.72,
      }}
    />
  );
}

function Ball({ball}: {ball: BreakoutBallViewModel}) {
  return (
    <Box
      style={{
        x: Math.round(ball.x - ball.radius),
        y: Math.round(ball.y - ball.radius),
        width: ball.radius * 2,
        height: ball.radius * 2,
        borderRadius: ball.radius,
        backgroundColor: "#f4fffb",
      }}
    />
  );
}

function Drop({drop}: {drop: BreakoutDropViewModel}) {
  return (
    <Box
      style={{
        x: Math.round(drop.x),
        y: Math.round(drop.y),
        width: drop.size,
        height: drop.size,
        borderRadius: 1,
        backgroundColor: "#b8fff1",
        opacity: 0.78,
      }}
    />
  );
}
