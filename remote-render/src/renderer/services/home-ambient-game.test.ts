import {describe, expect, test} from "vitest";

import {buildHomeAmbientGameViewModel} from "./home-ambient-game.js";

describe("home ambient game view model", () => {
  test("switches between snake and Conway life every five minutes", () => {
    const snake = buildHomeAmbientGameViewModel({currentTime: new Date("2026-05-01T12:00:00.000+08:00"), step: 10});
    const life = buildHomeAmbientGameViewModel({currentTime: new Date("2026-05-01T12:05:00.000+08:00"), step: 10});
    const snakeAgain = buildHomeAmbientGameViewModel({currentTime: new Date("2026-05-01T12:10:00.000+08:00"), step: 10});

    expect(snake.kind).toBe("snake");
    expect(life.kind).toBe("life");
    expect(snakeAgain.kind).toBe("snake");
  });

  test("regenerates Conway seeds for different life windows", () => {
    const first = buildHomeAmbientGameViewModel({currentTime: new Date("2026-05-01T12:05:00.000+08:00"), step: 0});
    const second = buildHomeAmbientGameViewModel({currentTime: new Date("2026-05-01T12:15:00.000+08:00"), step: 0});

    expect(first.kind).toBe("life");
    expect(second.kind).toBe("life");
    if (first.kind === "life" && second.kind === "life") {
      expect(second.life.alive).not.toEqual(first.life.alive);
    }
  });

  test("advances Conway life inside the same five-minute window from wall clock time", () => {
    const start = buildHomeAmbientGameViewModel({currentTime: new Date("2026-05-01T12:05:00.000+08:00")});
    const later = buildHomeAmbientGameViewModel({currentTime: new Date("2026-05-01T12:06:00.000+08:00")});

    expect(start.kind).toBe("life");
    expect(later.kind).toBe("life");
    if (start.kind === "life" && later.kind === "life") {
      expect(later.life.alive).not.toEqual(start.life.alive);
    }
  });

  test("advances snake from wall clock time inside a five-minute snake window", () => {
    const start = buildHomeAmbientGameViewModel({currentTime: new Date("2026-05-01T12:00:00.000+08:00")});
    const later = buildHomeAmbientGameViewModel({currentTime: new Date("2026-05-01T12:03:00.000+08:00")});

    expect(start.kind).toBe("snake");
    expect(later.kind).toBe("snake");
    if (start.kind === "snake" && later.kind === "snake") {
      expect(later.snake).not.toEqual(start.snake);
    }
  });

  test("uses explicit game step when the frame scheduler freezes game state", () => {
    const start = buildHomeAmbientGameViewModel({currentTime: new Date("2026-05-01T12:00:00.000+08:00"), step: 0});
    const later = buildHomeAmbientGameViewModel({currentTime: new Date("2026-05-01T12:03:00.000+08:00"), step: 0});

    expect(start).toEqual(later);
  });
});
