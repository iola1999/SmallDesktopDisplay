import {afterEach, beforeEach, describe, expect, test} from "vitest";

import {createRemoteRenderServer, type RemoteRenderServer} from "./server.js";

describe("legacy preference API compatibility", () => {
  let server: RemoteRenderServer;
  let baseUrl: string;

  beforeEach(async () => {
    server = createRemoteRenderServer();
    await server.listen(0, "127.0.0.1");
    const address = server.address();
    if (address === null || typeof address === "string") throw new Error("server did not bind to TCP");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await server.close();
  });

  test("theme and font changes update versioned config while brightness stays device-owned", async () => {
    const appearance = await fetch(`${baseUrl}/api/v1/devices/desk-legacy-api/prefs`, {
      method: "POST",
      headers: {"content-type": "application/json"},
      body: JSON.stringify({themeKey: "mono", fontKey: "noto_cjk"}),
    });
    expect(appearance.status).toBe(200);

    const afterAppearance = await fetch(`${baseUrl}/api/v1/devices/desk-legacy-api/config`);
    expect(afterAppearance.headers.get("etag")).toBe('"1"');
    await expect(afterAppearance.json()).resolves.toMatchObject({
      revision: 1,
      config: {appearance: {themeKey: "mono", fontKey: "noto_cjk"}},
    });

    const brightness = await fetch(`${baseUrl}/api/v1/devices/desk-legacy-api/prefs`, {
      method: "POST",
      headers: {"content-type": "application/json"},
      body: JSON.stringify({brightness: 80}),
    });
    expect(brightness.status).toBe(200);

    const afterBrightness = await fetch(`${baseUrl}/api/v1/devices/desk-legacy-api/config`);
    expect(afterBrightness.headers.get("etag")).toBe('"1"');
  });
});
