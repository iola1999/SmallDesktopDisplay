import {defineConfig} from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.{ts,tsx}", "console/src/**/*.test.{ts,tsx}"],
  },
});
