import {mkdtempSync, mkdirSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import path from "node:path";

import {describe, expect, test} from "vitest";

import {ConfigStore} from "./config/store.js";
import {createRemoteRenderServer, type RemoteRenderServer} from "./server.js";
import {DeviceRegistry} from "./state.js";

interface ServerOptions {
  configStore?: unknown;
  consoleDir?: string;
}

interface DeviceConfig {
  appearance: {
    themeKey: string;
    fontKey: string;
  };
  home: {
    layout: string;
    header: {
      showDate: boolean;
      showLunar: boolean;
    };
    weather: {
      showCurrent: boolean;
      showTodayRange: boolean;
      showDailyOutlook: boolean;
    };
  };
}

interface DeviceConfigResponse {
  schemaVersion: number;
  revision: number;
  deviceId: string;
  config: DeviceConfig;
}

const DEFAULT_CONFIG: DeviceConfig = {
  appearance: {
    themeKey: "midnight",
    fontKey: "lxgw_wenkai_screen",
  },
  home: {
    layout: "balanced",
    header: {
      showDate: true,
      showLunar: true,
    },
    weather: {
      showCurrent: true,
      showTodayRange: true,
      showDailyOutlook: true,
    },
  },
};

const createServerWithOptions = createRemoteRenderServer as unknown as (
  registry?: DeviceRegistry,
  options?: ServerOptions,
) => RemoteRenderServer;

async function withServer(
  run: (baseUrl: string) => Promise<void>,
  registry = new DeviceRegistry(),
  options: ServerOptions = {},
): Promise<void> {
  const server = createServerWithOptions(registry, options);
  await server.listen(0, "127.0.0.1");
  const address = server.address();
  if (address === null || typeof address === "string") {
    await server.close();
    throw new Error("server did not bind to TCP");
  }
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await server.close();
  }
}

async function getDeviceConfig(baseUrl: string, deviceId: string): Promise<{response: Response; body: DeviceConfigResponse}> {
  const response = await fetch(`${baseUrl}/api/v1/devices/${encodeURIComponent(deviceId)}/config`);
  return {response, body: (await response.json()) as DeviceConfigResponse};
}

function patchConfig(baseUrl: string, deviceId: string, revision: number, body: unknown, origin?: string): Promise<Response> {
  return fetch(`${baseUrl}/api/v1/devices/${encodeURIComponent(deviceId)}/config`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json; charset=utf-8",
      "if-match": `"${revision}"`,
      ...(origin ? {origin} : {}),
    },
    body: JSON.stringify(body),
  });
}

describe("console foundation API", () => {
  test("returns the catalog and a complete default device configuration", async () => {
    await withServer(async (baseUrl) => {
      const catalogResponse = await fetch(`${baseUrl}/api/v1/catalog`);
      expect(catalogResponse.status).toBe(200);
      const catalog = (await catalogResponse.json()) as Record<string, unknown>;
      expect(catalog.schemaVersion).toBe(1);
      expect(catalog.themes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({key: "midnight", label: expect.any(String)}),
          expect.objectContaining({key: "dusk", label: expect.any(String)}),
          expect.objectContaining({key: "sakura", label: expect.any(String)}),
          expect.objectContaining({key: "amber", label: expect.any(String)}),
          expect.objectContaining({key: "mono", label: expect.any(String)}),
        ]),
      );
      expect(catalog.fonts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({key: "lxgw_wenkai_screen", label: expect.any(String)}),
          expect.objectContaining({key: "maple_mono_nf_cn", label: expect.any(String)}),
          expect.objectContaining({key: "noto_cjk", label: expect.any(String)}),
        ]),
      );
      expect(catalog.homeLayouts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({key: "balanced", label: expect.any(String)}),
          expect.objectContaining({key: "clock", label: expect.any(String)}),
          expect.objectContaining({key: "weather", label: expect.any(String)}),
        ]),
      );

      const {response, body} = await getDeviceConfig(baseUrl, "desk-default");
      expect(response.status).toBe(200);
      expect(response.headers.get("etag")).toBe('"0"');
      expect(body).toEqual({
        schemaVersion: 1,
        revision: 0,
        deviceId: "desk-default",
        config: DEFAULT_CONFIG,
      });
    });
  });

  test("deeply merges direct and wrapped patches while preserving sibling fields", async () => {
    await withServer(async (baseUrl) => {
      const direct = await patchConfig(baseUrl, "desk-merge", 0, {
        appearance: {themeKey: "amber"},
        home: {header: {showLunar: false}},
      });
      expect(direct.status).toBe(200);
      expect(direct.headers.get("etag")).toBe('"1"');
      const directBody = (await direct.json()) as DeviceConfigResponse;
      expect(directBody).toEqual({
        schemaVersion: 1,
        revision: 1,
        deviceId: "desk-merge",
        config: {
          ...DEFAULT_CONFIG,
          appearance: {...DEFAULT_CONFIG.appearance, themeKey: "amber"},
          home: {
            ...DEFAULT_CONFIG.home,
            header: {...DEFAULT_CONFIG.home.header, showLunar: false},
          },
        },
      });

      const wrapped = await patchConfig(baseUrl, "desk-merge", 1, {
        config: {home: {weather: {showCurrent: false}}},
      });
      expect(wrapped.status).toBe(200);
      expect(wrapped.headers.get("etag")).toBe('"2"');

      const {body: saved} = await getDeviceConfig(baseUrl, "desk-merge");
      expect(saved.revision).toBe(2);
      expect(saved.config).toMatchObject({
        appearance: {themeKey: "amber", fontKey: "lxgw_wenkai_screen"},
        home: {
          layout: "balanced",
          header: {showDate: true, showLunar: false},
          weather: {showCurrent: false, showTodayRange: true, showDailyOutlook: true},
        },
      });
    });
  });

  test("rejects invalid values and unknown fields at nested configuration paths", async () => {
    await withServer(async (baseUrl) => {
      const invalidPatches: unknown[] = [
        {config: {appearance: {themeKey: "neon"}}},
        {config: {appearance: {fontKey: "missing-font"}}},
        {config: {home: {layout: "freeform"}}},
        {config: {home: {header: {showDate: "yes"}}}},
        {config: {home: {weather: {showDailyOutlook: null}}}},
        {config: {home: {header: {showDate: true, unknown: true}}}},
        {config: null},
      ];

      for (const invalidPatch of invalidPatches) {
        const response = await patchConfig(baseUrl, "desk-invalid-config", 0, invalidPatch);
        expect(response.status, JSON.stringify(invalidPatch)).toBe(422);
      }

      const {body} = await getDeviceConfig(baseUrl, "desk-invalid-config");
      expect(body.revision).toBe(0);
      expect(body.config).toEqual(DEFAULT_CONFIG);
    });
  });

  test("requires If-Match and reports the current revision on a stale update", async () => {
    await withServer(async (baseUrl) => {
      const missingRevision = await fetch(`${baseUrl}/api/v1/devices/desk-conflict/config`, {
        method: "PATCH",
        headers: {"content-type": "application/json"},
        body: JSON.stringify({appearance: {themeKey: "dusk"}}),
      });
      expect(missingRevision.status).toBe(428);

      const first = await patchConfig(baseUrl, "desk-conflict", 0, {appearance: {themeKey: "dusk"}});
      expect(first.status).toBe(200);
      expect(first.headers.get("etag")).toBe('"1"');

      const stale = await patchConfig(baseUrl, "desk-conflict", 0, {appearance: {themeKey: "sakura"}});
      expect(stale.status).toBe(409);
      expect(stale.headers.get("etag")).toBe('"1"');
      await expect(stale.json()).resolves.toMatchObject({
        detail: expect.any(String),
        currentRevision: 1,
      });

      const {body} = await getDeviceConfig(baseUrl, "desk-conflict");
      expect(body.revision).toBe(1);
      expect(body.config.appearance.themeKey).toBe("dusk");
    });
  });

  test("publishes explicit revisions and rolls back through device history", async () => {
    await withServer(async (baseUrl) => {
      expect((await patchConfig(baseUrl, "desk-history-api", 0, {appearance: {themeKey: "amber"}})).status).toBe(200);
      expect((await patchConfig(baseUrl, "desk-history-api", 1, {appearance: {themeKey: "sakura"}})).status).toBe(200);

      const beforePublish = await fetch(`${baseUrl}/api/v1/devices/desk-history-api/config/history`);
      expect(beforePublish.status).toBe(200);
      expect(beforePublish.headers.get("etag")).toBe('"2"');
      await expect(beforePublish.json()).resolves.toMatchObject({
        schemaVersion: 1,
        deviceId: "desk-history-api",
        currentRevision: 2,
        currentConfig: {appearance: {themeKey: "sakura"}},
        entries: [],
      });

      const missingMatch = await fetch(`${baseUrl}/api/v1/devices/desk-history-api/config/publish`, {
        method: "POST",
        headers: {"content-type": "application/json"},
        body: "{}",
      });
      expect(missingMatch.status).toBe(428);

      const publish = await fetch(`${baseUrl}/api/v1/devices/desk-history-api/config/publish`, {
        method: "POST",
        headers: {"content-type": "application/json", "if-match": '"2"'},
        body: "{}",
      });
      expect(publish.status).toBe(200);
      expect(publish.headers.get("etag")).toBe('"3"');
      await expect(publish.json()).resolves.toMatchObject({
        revision: 3,
        config: {appearance: {themeKey: "sakura"}},
      });

      const patchAfterPublish = await patchConfig(baseUrl, "desk-history-api", 3, {
        appearance: {themeKey: "amber"},
      });
      expect(patchAfterPublish.status).toBe(200);
      expect(patchAfterPublish.headers.get("etag")).toBe('"4"');

      const unpublishedRevision = await fetch(`${baseUrl}/api/v1/devices/desk-history-api/config/rollback`, {
        method: "POST",
        headers: {"content-type": "application/json", "if-match": '"4"'},
        body: JSON.stringify({revision: 1}),
      });
      expect(unpublishedRevision.status).toBe(404);

      const rollback = await fetch(`${baseUrl}/api/v1/devices/desk-history-api/config/rollback`, {
        method: "POST",
        headers: {"content-type": "application/json", "if-match": '"4"'},
        body: JSON.stringify({revision: 3}),
      });
      expect(rollback.status).toBe(200);
      expect(rollback.headers.get("etag")).toBe('"5"');
      await expect(rollback.json()).resolves.toMatchObject({
        revision: 5,
        config: {appearance: {themeKey: "sakura"}},
      });

      const history = await fetch(`${baseUrl}/api/v1/devices/desk-history-api/config/history`);
      await expect(history.json()).resolves.toMatchObject({
        currentRevision: 5,
        currentConfig: {appearance: {themeKey: "sakura"}},
        entries: [{revision: 3, config: {appearance: {themeKey: "sakura"}}}],
      });

      const missingRevision = await fetch(`${baseUrl}/api/v1/devices/desk-history-api/config/rollback`, {
        method: "POST",
        headers: {"content-type": "application/json", "if-match": '"5"'},
        body: JSON.stringify({revision: 99}),
      });
      expect(missingRevision.status).toBe(404);
      await expect(missingRevision.json()).resolves.toEqual({
        detail: "config history revision not found",
        revision: 99,
      });

      const stalePublish = await fetch(`${baseUrl}/api/v1/devices/desk-history-api/config/publish`, {
        method: "POST",
        headers: {"content-type": "application/json", "if-match": '"3"'},
        body: "{}",
      });
      expect(stalePublish.status).toBe(409);
      expect(stalePublish.headers.get("etag")).toBe('"5"');
    });
  });

  test("returns the current device config without other devices' published versions", async () => {
    const configStore = new ConfigStore();
    configStore.patchDeviceConfig("desk-pruned-current", {appearance: {themeKey: "amber"}}, 0);
    for (let revision = 1; revision < 26; revision += 1) {
      configStore.publishDeviceConfig("desk-history-noise", revision);
    }
    expect(configStore.listDeviceHistory("desk-pruned-current")).toEqual([]);

    await withServer(
      async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/v1/devices/desk-pruned-current/config/history`);
        expect(response.status).toBe(200);
        expect(response.headers.get("etag")).toBe('"26"');
        await expect(response.json()).resolves.toEqual({
          schemaVersion: 1,
          deviceId: "desk-pruned-current",
          currentRevision: 26,
          currentConfig: {
            ...DEFAULT_CONFIG,
            appearance: {...DEFAULT_CONFIG.appearance, themeKey: "amber"},
          },
          entries: [],
        });
      },
      new DeviceRegistry(),
      {configStore},
    );
  });

  test("rejects malformed If-Match values without changing the revision", async () => {
    await withServer(async (baseUrl) => {
      for (const value of ["0", "W/\"0\"", '"abc"', "*", '"9007199254740992"']) {
        const response = await fetch(`${baseUrl}/api/v1/devices/desk-etag/config`, {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            "if-match": value,
          },
          body: JSON.stringify({appearance: {themeKey: "mono"}}),
        });
        expect(response.status, value).toBe(422);
        await response.arrayBuffer();
      }

      const {response, body} = await getDeviceConfig(baseUrl, "desk-etag");
      expect(response.headers.get("etag")).toBe('"0"');
      expect(body.revision).toBe(0);
      expect(body.config).toEqual(DEFAULT_CONFIG);
    });
  });

  test("renders a draft preview without changing saved config or live device state", async () => {
    const registry = new DeviceRegistry({now: () => new Date("2026-08-23T10:15:30.000+08:00")});
    const deviceId = "desk-draft-preview";
    await registry.getFrame(deviceId, 0, 0);
    registry.applyConsoleGesture(deviceId, "long_press");
    const state = registry.devices.get(deviceId)!;
    const stateSnapshot = {
      ui: structuredClone(state.ui),
      frameId: state.frameId,
      buttonCount: state.buttonCount,
      lastInputSeq: state.lastInputSeq,
      lastRenderedAt: state.lastRenderedAt,
      deviceCount: registry.devices.size,
    };

    await withServer(
      async (baseUrl) => {
        const before = await getDeviceConfig(baseUrl, deviceId);
        const baselinePreview = await fetch(`${baseUrl}/api/v1/devices/${deviceId}/preview`, {
          method: "POST",
          headers: {"content-type": "application/json"},
          body: JSON.stringify({config: {}}),
        });
        expect(baselinePreview.status).toBe(200);
        const baselinePng = Buffer.from(await baselinePreview.arrayBuffer());
        const preview = await fetch(`${baseUrl}/api/v1/devices/${deviceId}/preview`, {
          method: "POST",
          headers: {"content-type": "application/json"},
          body: JSON.stringify({
            config: {
              appearance: {themeKey: "sakura"},
              home: {
                layout: "clock",
                header: {showDate: false},
                weather: {showCurrent: false, showTodayRange: false, showDailyOutlook: false},
              },
            },
          }),
        });
        expect(preview.status).toBe(200);
        expect(preview.headers.get("content-type")).toBe("image/png");
        const png = Buffer.from(await preview.arrayBuffer());
        expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
        expect(Buffer.compare(png, baselinePng)).not.toBe(0);

        const after = await getDeviceConfig(baseUrl, deviceId);
        expect(after.body).toEqual(before.body);
        expect(after.response.headers.get("etag")).toBe(before.response.headers.get("etag"));
        expect(registry.devices.size).toBe(stateSnapshot.deviceCount);
        expect(registry.devices.get(deviceId)).toBe(state);
        expect(state.ui).toEqual(stateSnapshot.ui);
        expect(state.frameId).toBe(stateSnapshot.frameId);
        expect(state.buttonCount).toBe(stateSnapshot.buttonCount);
        expect(state.lastInputSeq).toBe(stateSnapshot.lastInputSeq);
        expect(state.lastRenderedAt).toBe(stateSnapshot.lastRenderedAt);
      },
      registry,
    );
  });

  test("accepts historical device IDs and validates Origin and JSON Content-Type", async () => {
    await withServer(async (baseUrl) => {
      for (const historicalId of ["desk id", "中文设备", "x".repeat(65)]) {
        const response = await fetch(`${baseUrl}/api/v1/devices/${encodeURIComponent(historicalId)}/config`);
        expect(response.status, historicalId).toBe(200);
      }

      const malformedId = await fetch(`${baseUrl}/api/v1/devices/%E0%A4%A/config`);
      expect(malformedId.status).toBe(422);

      const missingContentType = await fetch(`${baseUrl}/api/v1/devices/desk-security/config`, {
        method: "PATCH",
        headers: {"if-match": '"0"'},
        body: JSON.stringify({appearance: {themeKey: "mono"}}),
      });
      expect(missingContentType.status).toBe(415);

      const wrongContentType = await fetch(`${baseUrl}/api/v1/devices/desk-security/preview`, {
        method: "POST",
        headers: {"content-type": "text/plain"},
        body: JSON.stringify({config: {home: {layout: "clock"}}}),
      });
      expect(wrongContentType.status).toBe(415);

      const foreignOrigin = await patchConfig(
        baseUrl,
        "desk-security",
        0,
        {appearance: {themeKey: "mono"}},
        "https://attacker.example",
      );
      expect(foreignOrigin.status).toBe(403);

      const sameOrigin = await patchConfig(baseUrl, "desk-security", 0, {appearance: {themeKey: "mono"}}, baseUrl);
      expect(sameOrigin.status).toBe(200);
    });
  });
});

describe("console static assets", () => {
  test("serves the configured console directory with browser security headers", async () => {
    const tempRoot = mkdtempSync(path.join(tmpdir(), "sdd-console-test-"));
    const consoleDir = path.join(tempRoot, "console");
    mkdirSync(consoleDir);
    mkdirSync(path.join(consoleDir, "assets"));
    writeFileSync(path.join(consoleDir, "index.html"), "<!doctype html><title>Console fixture</title>");
    writeFileSync(path.join(consoleDir, "assets", "app.js"), "document.body.dataset.ready = 'true';");
    writeFileSync(path.join(tempRoot, "secret.txt"), "must not be served");

    try {
      await withServer(
        async (baseUrl) => {
          for (const pathname of ["/", "/console", "/console/assets/app.js"]) {
            const response = await fetch(`${baseUrl}${pathname}`);
            expect(response.status, pathname).toBe(200);
            expect(response.headers.get("x-content-type-options"), pathname).toBe("nosniff");
            expect(response.headers.get("content-security-policy"), pathname).toContain("frame-ancestors 'none'");
            expect(response.headers.get("content-security-policy"), pathname).toContain("script-src 'self'");
            await response.arrayBuffer();
          }

          const index = await fetch(`${baseUrl}/console`);
          expect(await index.text()).toContain("Console fixture");
          const script = await fetch(`${baseUrl}/console/assets/app.js`);
          expect(script.headers.get("content-type")).toContain("javascript");
          expect(await script.text()).toContain("dataset.ready");

          for (const pathname of ["/console/%2e%2e%2fsecret.txt", "/console/%2fetc%2fpasswd"]) {
            const response = await fetch(`${baseUrl}${pathname}`);
            expect(response.status, pathname).toBe(404);
            expect(await response.text()).not.toContain("must not be served");
          }
        },
        new DeviceRegistry(),
        {consoleDir},
      );
    } finally {
      rmSync(tempRoot, {recursive: true, force: true});
    }
  });
});
