import type {
  AutoBreakoutViewModel,
  BreakoutBallViewModel,
  BreakoutBrickViewModel,
  BreakoutDropViewModel,
  BreakoutPaddleViewModel,
} from "../models/view-model.js";

const DEFAULT_WIDTH = 192;
const DEFAULT_HEIGHT = 84;
const PADDLE_WIDTH = 34;
const PADDLE_HEIGHT = 5;
const PADDLE_SPEED = 13;
const BALL_RADIUS = 3;
const BALL_SPEED = 5.2;
const DROP_SPEED = 3.2;
const MAX_BALLS = 5;

export interface AutoBreakoutRuntime {
  seed: string;
  width: number;
  height: number;
  bricks: BreakoutBrickViewModel[];
  balls: BreakoutBallState[];
  drops: BreakoutDropViewModel[];
  paddle: BreakoutPaddleViewModel;
  tick: number;
}

export interface BreakoutBallState extends BreakoutBallViewModel {
  dx: number;
  dy: number;
}

export function createAutoBreakoutRuntime(input: {seed: string; width?: number; height?: number}): AutoBreakoutRuntime {
  const width = input.width ?? DEFAULT_WIDTH;
  const height = input.height ?? DEFAULT_HEIGHT;
  const paddle = {
    x: Math.round((width - PADDLE_WIDTH) / 2),
    y: height - 9,
    width: PADDLE_WIDTH,
    height: PADDLE_HEIGHT,
  };
  return {
    seed: input.seed,
    width,
    height,
    bricks: createBricks(width),
    balls: [{x: width / 2, y: height - 18, radius: BALL_RADIUS, dx: 3.2, dy: -BALL_SPEED}],
    drops: [],
    paddle,
    tick: 0,
  };
}

export function advanceAutoBreakoutRuntime(state: AutoBreakoutRuntime): {runtime: AutoBreakoutRuntime; status: "playing" | "failed" | "won"} {
  const targetX = selectPaddleTarget(state);
  const paddle = movePaddle(state.paddle, targetX, state.width);
  const bricks = state.bricks.map((brick) => ({...brick}));
  const balls: BreakoutBallState[] = [];
  const drops = state.drops.map((drop) => ({...drop, y: drop.y + DROP_SPEED}));

  for (const current of state.balls) {
    let ball = {...current, x: current.x + current.dx, y: current.y + current.dy};
    if (ball.x - ball.radius <= 0 || ball.x + ball.radius >= state.width) {
      ball.dx = -ball.dx;
      ball.x = clamp(ball.x, ball.radius, state.width - ball.radius);
    }
    if (ball.y - ball.radius <= 0) {
      ball.dy = Math.abs(ball.dy);
      ball.y = ball.radius;
    }
    if (ball.dy > 0 && intersectsBallRect(ball, paddle)) {
      const hit = clamp((ball.x - (paddle.x + paddle.width / 2)) / (paddle.width / 2), -1, 1);
      ball.dx = hit * 3.6;
      ball.dy = -BALL_SPEED;
      ball.y = paddle.y - ball.radius - 1;
    }
    const brickIndex = bricks.findIndex((brick) => brick.strength > 0 && intersectsBallRect(ball, brick));
    if (brickIndex >= 0) {
      const brick = bricks[brickIndex];
      brick.strength -= 1;
      ball.dy = Math.abs(ball.dy);
      ball.y = brick.y + brick.height + ball.radius + 1;
      if (brick.strength <= 0 && shouldDrop(state.seed, state.tick, brickIndex)) {
        drops.push({x: brick.x + brick.width / 2 - 2, y: brick.y + brick.height, size: 4});
      }
    }
    if (ball.y - ball.radius <= state.height) {
      balls.push(ball);
    }
  }

  const caughtDrops: BreakoutDropViewModel[] = [];
  const activeDrops: BreakoutDropViewModel[] = [];
  for (const drop of drops) {
    if (rectsOverlap({x: drop.x, y: drop.y, width: drop.size, height: drop.size}, paddle)) {
      caughtDrops.push(drop);
      continue;
    }
    if (drop.y <= state.height) activeDrops.push(drop);
  }

  const boostedBalls = [...balls];
  for (const drop of caughtDrops) {
    if (boostedBalls.length >= MAX_BALLS) break;
    boostedBalls.push({
      x: paddle.x + paddle.width / 2,
      y: paddle.y - BALL_RADIUS - 1,
      radius: BALL_RADIUS,
      dx: drop.x < paddle.x + paddle.width / 2 ? -2.7 : 2.7,
      dy: -BALL_SPEED,
    });
  }

  if (boostedBalls.length === 0) {
    return {runtime: {...state, paddle, bricks, balls: [], drops: activeDrops, tick: state.tick + 1}, status: "failed"};
  }
  if (bricks.every((brick) => brick.strength <= 0)) {
    return {runtime: {...state, paddle, bricks, balls: boostedBalls, drops: activeDrops, tick: state.tick + 1}, status: "won"};
  }
  return {
    runtime: {...state, paddle, bricks, balls: boostedBalls, drops: activeDrops.slice(-8), tick: state.tick + 1},
    status: "playing",
  };
}

export function autoBreakoutRuntimeToViewModel(state: AutoBreakoutRuntime): AutoBreakoutViewModel {
  return {
    width: state.width,
    height: state.height,
    bricks: state.bricks.filter((brick) => brick.strength > 0),
    balls: state.balls.map(({x, y, radius}) => ({x, y, radius})),
    drops: state.drops,
    paddle: state.paddle,
  };
}

function createBricks(width: number): BreakoutBrickViewModel[] {
  const columns = 24;
  const rows = 6;
  const gap = 1;
  const contentWidth = width - gap * 2;
  const bricks: BreakoutBrickViewModel[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const x = gap + Math.round((column * contentWidth) / columns);
      const nextX = gap + Math.round(((column + 1) * contentWidth) / columns);
      bricks.push({
        x,
        y: 4 + row * 6,
        width: Math.max(1, nextX - x - gap),
        height: 4,
        strength: row < 2 ? 2 : 1,
      });
    }
  }
  return bricks;
}

function selectPaddleTarget(state: AutoBreakoutRuntime): number {
  const falling = state.drops
    .filter((drop) => drop.y >= state.height * 0.36)
    .sort((left, right) => right.y - left.y)[0];
  if (falling) return falling.x;
  const ball = state.balls
    .filter((candidate) => candidate.dy > 0)
    .sort((left, right) => right.y - left.y)[0] ?? state.balls[0];
  return ball?.x ?? state.width / 2;
}

function movePaddle(paddle: BreakoutPaddleViewModel, targetX: number, width: number): BreakoutPaddleViewModel {
  const center = paddle.x + paddle.width / 2;
  const delta = clamp(targetX - center, -PADDLE_SPEED, PADDLE_SPEED);
  return {...paddle, x: clamp(paddle.x + delta, 0, width - paddle.width)};
}

function shouldDrop(seed: string, tick: number, brickIndex: number): boolean {
  return positiveModulo(hash(`${seed}:${tick}:${brickIndex}`), 100) < 28;
}

function intersectsBallRect(ball: BreakoutBallViewModel, rect: {x: number; y: number; width: number; height: number}): boolean {
  const closestX = clamp(ball.x, rect.x, rect.x + rect.width);
  const closestY = clamp(ball.y, rect.y, rect.y + rect.height);
  return (ball.x - closestX) ** 2 + (ball.y - closestY) ** 2 <= ball.radius ** 2;
}

function rectsOverlap(left: {x: number; y: number; width: number; height: number}, right: {x: number; y: number; width: number; height: number}): boolean {
  return left.x < right.x + right.width && left.x + left.width > right.x && left.y < right.y + right.height && left.y + left.height > right.y;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function positiveModulo(value: number, modulo: number): number {
  return ((value % modulo) + modulo) % modulo;
}

function hash(value: string): number {
  let result = 2166136261;
  for (const char of value) {
    result ^= char.charCodeAt(0);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}
