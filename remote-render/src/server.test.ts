import {afterEach, beforeEach, describe, expect, test} from "vitest";

import {createRemoteRenderServer, type RemoteRenderServer} from "./server.js";

describe("Node HTTP API", () => {
  let server: RemoteRenderServer;
  let baseUrl: string;

  beforeEach(async () => {
    server = createRemoteRenderServer();
    await server.listen(0, "127.0.0.1");
    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("server did not bind to TCP");
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await server.close();
  });

  test("serves health and frame endpoints with the existing URL contract", async () => {
    await expect(fetch(`${baseUrl}/api/v1/health`).then((response) => response.json())).resolves.toEqual({
      status: "ok",
    });

    const first = await fetch(`${baseUrl}/api/v1/devices/desk-01/frame?have=0`);
    expect(first.status).toBe(200);
    expect(first.headers.get("content-type")).toBe("application/octet-stream");
    expect(first.headers.get("transfer-encoding")).toBeNull();
    expect(first.headers.get("x-sdd-server-wait-ms")).toMatch(/^\d+$/);
    // 命令 piggyback 信号：200/204 都必须携带，设备据此免除命令盲轮询
    expect(first.headers.get("x-sdd-cmd")).toBe("0");
    const body = Buffer.from(await first.arrayBuffer());
    expect(first.headers.get("content-length")).toBe(String(body.length));
    const frameId = body.readUInt32LE(8);

    const second = await fetch(`${baseUrl}/api/v1/devices/desk-01/frame?have=${frameId}&wait_ms=1`);
    expect(second.status).toBe(204);
    expect(second.headers.get("x-sdd-cmd")).toBe("0");
  });

  test("validates status payload fields like the previous API contract", async () => {
    const invalid = await fetch(`${baseUrl}/api/v1/devices/desk-invalid/status`, {
      method: "POST",
      headers: {"content-type": "application/json"},
      body: JSON.stringify({brightness: 101, uptime_ms: 1234}),
    });

    expect(invalid.status).toBe(422);
  });

  test("accepts a valid input event with 202", async () => {
    const response = await fetch(`${baseUrl}/api/v1/devices/desk-input/input`, {
      method: "POST",
      headers: {"content-type": "application/json"},
      body: JSON.stringify({seq: 1, event: "short_press", uptime_ms: 1000}),
    });

    expect(response.status).toBe(202);
  });

  test("returns 204 for commands when none queued and the queued command after a brightness change", async () => {
    const none = await fetch(`${baseUrl}/api/v1/devices/desk-cmd/commands?after=0`);
    expect(none.status).toBe(204);

    const post = (seq: number, event: string, uptimeMs: number) =>
      fetch(`${baseUrl}/api/v1/devices/desk-cmd/input`, {
        method: "POST",
        headers: {"content-type": "application/json"},
        body: JSON.stringify({seq, event, uptime_ms: uptimeMs}),
      });
    await post(1, "long_press", 100); // home -> settings (Brightness selected)
    await post(2, "long_press", 200); // settings -> brightness detail
    await post(3, "short_press", 300); // adjust brightness -> queues set_brightness

    const queued = await fetch(`${baseUrl}/api/v1/devices/desk-cmd/commands?after=0`);
    expect(queued.status).toBe(200);
    await expect(queued.json()).resolves.toMatchObject({type: "set_brightness"});

    // 命令入队后，帧响应头携带其 id，通知设备来取
    const frame = await fetch(`${baseUrl}/api/v1/devices/desk-cmd/frame?have=0`);
    expect(frame.headers.get("x-sdd-cmd")).toBe("1");
    await frame.arrayBuffer();
  });

  test("serves the web console at / and /console", async () => {
    const root = await fetch(`${baseUrl}/`);
    expect(root.status).toBe(200);
    expect(root.headers.get("content-type")).toContain("text/html");
    expect(await root.text()).toContain("SmallDesktopDisplay 控制台");
    expect((await fetch(`${baseUrl}/console`)).status).toBe(200);
  });

  test("lists devices and serves a PNG preview", async () => {
    await fetch(`${baseUrl}/api/v1/devices/desk-list/frame?have=0`);
    const list = await (await fetch(`${baseUrl}/api/v1/devices`)).json();
    expect(list.devices.some((d: {deviceId: string}) => d.deviceId === "desk-list")).toBe(true);

    const preview = await fetch(`${baseUrl}/api/v1/devices/desk-list/preview.png`);
    expect(preview.status).toBe(200);
    expect(preview.headers.get("content-type")).toBe("image/png");
    const png = Buffer.from(await preview.arrayBuffer());
    expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
  });

  test("prefs endpoint applies theme and font, rejects unknown keys", async () => {
    const ok = await fetch(`${baseUrl}/api/v1/devices/desk-prefs/prefs`, {
      method: "POST",
      headers: {"content-type": "application/json"},
      body: JSON.stringify({themeKey: "sakura", fontKey: "noto_cjk"}),
    });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({themeKey: "sakura", fontKey: "noto_cjk"});

    const bad = await fetch(`${baseUrl}/api/v1/devices/desk-prefs/prefs`, {
      method: "POST",
      headers: {"content-type": "application/json"},
      body: JSON.stringify({themeKey: "neon"}),
    });
    expect(bad.status).toBe(422);

    const empty = await fetch(`${baseUrl}/api/v1/devices/desk-prefs/prefs`, {
      method: "POST",
      headers: {"content-type": "application/json"},
      body: JSON.stringify({}),
    });
    expect(empty.status).toBe(422);
  });

  test("console gestures do not poison the device input dedup", async () => {
    // 控制台长按进设置
    const gesture = await fetch(`${baseUrl}/api/v1/devices/desk-console/console-input`, {
      method: "POST",
      headers: {"content-type": "application/json"},
      body: JSON.stringify({event: "long_press"}),
    });
    expect(gesture.status).toBe(202);
    const list = await (await fetch(`${baseUrl}/api/v1/devices`)).json();
    expect(list.devices.find((d: {deviceId: string}) => d.deviceId === "desk-console")?.page).toBe("settings");

    // 设备首次真实按键（seq 从 1 开始）必须仍被接受：短按在设置页移动选中项
    const device = await fetch(`${baseUrl}/api/v1/devices/desk-console/input`, {
      method: "POST",
      headers: {"content-type": "application/json"},
      body: JSON.stringify({seq: 1, event: "double_press", uptime_ms: 500}),
    });
    expect(device.status).toBe(202);
    const after = await (await fetch(`${baseUrl}/api/v1/devices`)).json();
    expect(after.devices.find((d: {deviceId: string}) => d.deviceId === "desk-console")?.page).toBe("home");
  });

  test("returns 404 for unknown routes", async () => {
    const response = await fetch(`${baseUrl}/api/v1/unknown`);
    expect(response.status).toBe(404);
  });

  test("returns 422 for malformed JSON instead of 500", async () => {
    const response = await fetch(`${baseUrl}/api/v1/devices/desk-bad-json/input`, {
      method: "POST",
      headers: {"content-type": "application/json"},
      body: "{bad json",
    });

    expect(response.status).toBe(422);
  });

  test("returns 422 for non-object JSON bodies instead of 500", async () => {
    const nullBody = await fetch(`${baseUrl}/api/v1/devices/desk-null/input`, {
      method: "POST",
      headers: {"content-type": "application/json"},
      body: "null",
    });
    expect(nullBody.status).toBe(422);

    const nullStatus = await fetch(`${baseUrl}/api/v1/devices/desk-null/status`, {
      method: "POST",
      headers: {"content-type": "application/json"},
      body: "null",
    });
    expect(nullStatus.status).toBe(422);
  });

  test("rejects an oversized request body with 413 and stays responsive", async () => {
    const oversized = await fetch(`${baseUrl}/api/v1/devices/desk-big/input`, {
      method: "POST",
      headers: {"content-type": "application/json"},
      body: `{"seq":1,"event":"short_press","uptime_ms":1,"pad":"${"x".repeat(64 * 1024)}"}`,
    });
    expect(oversized.status).toBe(413);

    await expect(fetch(`${baseUrl}/api/v1/health`).then((response) => response.json())).resolves.toEqual({
      status: "ok",
    });
  });
});
