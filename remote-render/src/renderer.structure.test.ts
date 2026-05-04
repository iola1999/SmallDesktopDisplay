import {existsSync, readFileSync} from "node:fs";
import {describe, expect, test} from "vitest";

const pageModules = ["home", "settings", "detail"] as const;
const expectedModules = [
  "components/frame-background.tsx",
  "components/primitives.tsx",
  "constants.ts",
  "hooks/useDeviceViewModel.ts",
  "host/jsx.d.ts",
  "host/reconciler.ts",
  "models/view-model.ts",
  "pages/detail.tsx",
  "pages/home.tsx",
  "pages/settings.tsx",
  "rendering/animation.ts",
  "rendering/canvas-frame.ts",
  "rendering/device-canvas.tsx",
  "rendering/dirty-rects.ts",
  "rendering/rasterizer.ts",
  "services/color.ts",
  "services/auto-breakout.ts",
  "services/auto-snake.ts",
  "services/clock-flip.ts",
  "services/conway-life.ts",
  "services/font-registry.ts",
  "services/home-ambient-game.ts",
  "services/home-game-state.ts",
  "services/home-copy.ts",
  "services/view-model.ts",
  "types.ts",
  "widgets/auto-breakout.tsx",
  "widgets/auto-snake.tsx",
  "widgets/conway-life.tsx",
  "widgets/home-ambient-game.tsx",
] as const;

describe("renderer source structure", () => {
  test("keeps renderer modules grouped by responsibility", () => {
    for (const modulePath of expectedModules) {
      expect(existsSync(new URL(`./renderer/${modulePath}`, import.meta.url)), modulePath).toBe(true);
    }
  });

  test("keeps page implementations as TSX modules", () => {
    for (const page of pageModules) {
      const source = readFileSync(new URL(`./renderer/pages/${page}.tsx`, import.meta.url), "utf8");

      expect(source).toContain("<Screen");
      expect(source).not.toContain("React.createElement");
      expect(source).not.toMatch(/from\s+["']\.\.\/\.\.\/ui-state\.js["']/);
    }
  });

  test("keeps the public renderer entrypoint thin", () => {
    const source = readFileSync(new URL("./renderer/index.ts", import.meta.url), "utf8");

    expect(source).not.toContain("@napi-rs/canvas");
    expect(source).not.toContain("yoga-layout");
    expect(source).not.toContain("react-reconciler");
  });

  test("does not draw a decorative crease line in clock flip slots", () => {
    const source = readFileSync(new URL("./renderer/pages/home.tsx", import.meta.url), "utf8");

    expect(source).not.toContain('backgroundColor: "#102326"');
  });
});
