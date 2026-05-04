import {readFileSync} from "node:fs";
import {describe, expect, test} from "vitest";

const pageModules = ["home", "settings", "detail"] as const;

describe("renderer source structure", () => {
  test("keeps page implementations as TSX modules", () => {
    for (const page of pageModules) {
      const source = readFileSync(new URL(`./renderer/pages/${page}.tsx`, import.meta.url), "utf8");

      expect(source).toContain("<Screen");
      expect(source).not.toContain("React.createElement");
    }
  });
});
