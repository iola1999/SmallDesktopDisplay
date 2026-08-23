import {existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import path from "node:path";

import {describe, expect, test, vi} from "vitest";

import {createDefaultDeviceConfig} from "./schema.js";
import {
  CONFIG_FILE_NAME,
  CONFIG_HISTORY_DIR_NAME,
  CONFIG_HISTORY_LIMIT,
  LEGACY_PREFS_BACKUP_FILE_NAME,
  LEGACY_PREFS_FILE_NAME,
  ConfigHistoryRevisionNotFoundError,
  ConfigStore,
  ConfigStoreReadOnlyError,
} from "./store.js";

function createTempDir(): string {
  return mkdtempSync(path.join(tmpdir(), "sdd-config-store-test-"));
}

function readJsonFile(filePath: string): unknown {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

describe("ConfigStore", () => {
  test("migrates legacy preferences and preserves the first backup", () => {
    const dir = createTempDir();
    const legacyPath = path.join(dir, LEGACY_PREFS_FILE_NAME);
    const backupPath = path.join(dir, LEGACY_PREFS_BACKUP_FILE_NAME);
    const configPath = path.join(dir, CONFIG_FILE_NAME);
    const originalLegacy = {
      "desk-legacy": {themeKey: "sakura", fontKey: "noto_cjk"},
      "bad id": {themeKey: "amber", fontKey: "noto_cjk"},
    };
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    try {
      writeFileSync(legacyPath, JSON.stringify(originalLegacy));
      const first = new ConfigStore(dir);

      expect(first.readOnlyReason).toBeNull();
      expect(first.revision).toBe(0);
      expect(first.listDeviceIds()).toEqual(["desk-legacy", "bad id"]);
      expect(first.getDeviceConfig("desk-legacy")).toEqual({
        ...createDefaultDeviceConfig(),
        appearance: {themeKey: "sakura", fontKey: "noto_cjk"},
      });
      expect(first.getDeviceConfig("bad id").appearance).toEqual({
        themeKey: "amber",
        fontKey: "noto_cjk",
      });
      expect(readJsonFile(configPath)).toEqual(first.getDocument());
      expect(readJsonFile(backupPath)).toEqual(originalLegacy);
      expect(statSync(configPath).mode & 0o777).toBe(0o600);

      const changedLegacy = {"desk-legacy": {themeKey: "amber", fontKey: "maple_mono_nf_cn"}};
      writeFileSync(legacyPath, JSON.stringify(changedLegacy));
      rmSync(configPath);
      const second = new ConfigStore(dir);

      expect(second.getDeviceConfig("desk-legacy").appearance).toEqual({
        themeKey: "amber",
        fontKey: "maple_mono_nf_cn",
      });
      expect(readJsonFile(backupPath)).toEqual(originalLegacy);
    } finally {
      log.mockRestore();
      rmSync(dir, {recursive: true, force: true});
    }
  });

  test("atomically saves each update and retains its revision after reload", () => {
    const dir = createTempDir();
    const configPath = path.join(dir, CONFIG_FILE_NAME);

    try {
      const store = new ConfigStore(dir);
      store.patchDeviceConfig("desk-persist", {appearance: {themeKey: "amber"}}, 0);
      store.patchDeviceConfig("desk-persist", {home: {header: {showDate: false}}}, 1);

      expect(store.revision).toBe(2);
      expect(readJsonFile(configPath)).toEqual(store.getDocument());
      expect(readdirSync(dir)).toEqual([CONFIG_FILE_NAME]);
      expect(store.listDeviceHistory("desk-persist")).toEqual([]);

      const reloaded = new ConfigStore(dir);
      expect(reloaded.revision).toBe(2);
      expect(reloaded.getDeviceConfig("desk-persist")).toMatchObject({
        appearance: {themeKey: "amber", fontKey: "lxgw_wenkai_screen"},
        home: {header: {showDate: false, showLunar: true}},
      });
      reloaded.patchDeviceConfig("desk-persist", {home: {weather: {showCurrent: false}}}, 2);
      reloaded.close();

      const saved = readJsonFile(configPath) as {revision: number; devices: Record<string, unknown>};
      expect(saved.revision).toBe(3);
      expect(saved.devices).toHaveProperty("desk-persist");
      expect(readdirSync(dir)).toEqual([CONFIG_FILE_NAME]);
      expect(reloaded.listDeviceHistory("desk-persist")).toEqual([]);
    } finally {
      rmSync(dir, {recursive: true, force: true});
    }
  });

  test("keeps the previous revision when an atomic save fails", () => {
    const dir = createTempDir();
    const configPath = path.join(dir, CONFIG_FILE_NAME);
    const tempPath = `${configPath}.${process.pid}.tmp`;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    try {
      const store = new ConfigStore(dir);
      store.patchDeviceConfig("desk-write-failure", {appearance: {themeKey: "amber"}}, 0);
      mkdirSync(tempPath);

      expect(() => store.patchDeviceConfig("desk-write-failure", {home: {layout: "weather"}}, 1)).toThrow(
        ConfigStoreReadOnlyError,
      );
      expect(store.revision).toBe(1);
      expect(store.listDeviceIds()).toEqual(["desk-write-failure"]);
      expect(store.readOnlyReason).toContain("config save failed");
      expect(readJsonFile(configPath)).toEqual(store.getDocument());
      expect(store.getDeviceConfig("desk-write-failure").home.layout).toBe("balanced");
      expect(existsSync(path.join(dir, CONFIG_HISTORY_DIR_NAME))).toBe(false);
    } finally {
      warn.mockRestore();
      rmSync(dir, {recursive: true, force: true});
    }
  });

  test("migrates and reloads prototype-like device IDs", () => {
    const dir = createTempDir();
    const legacyPath = path.join(dir, LEGACY_PREFS_FILE_NAME);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    try {
      writeFileSync(legacyPath, '{"__proto__":{"themeKey":"mono","fontKey":"noto_cjk"}}');
      const migrated = new ConfigStore(dir);
      expect(migrated.listDeviceIds()).toEqual(["__proto__"]);
      expect(migrated.getDeviceConfig("__proto__").appearance).toEqual({
        themeKey: "mono",
        fontKey: "noto_cjk",
      });

      const reloaded = new ConfigStore(dir);
      expect(reloaded.listDeviceIds()).toEqual(["__proto__"]);
      expect(reloaded.getDeviceConfig("__proto__").appearance.themeKey).toBe("mono");
    } finally {
      log.mockRestore();
      rmSync(dir, {recursive: true, force: true});
    }
  });

  test("does not publish migrated config until the legacy backup exists", () => {
    const dir = createTempDir();
    const legacyPath = path.join(dir, LEGACY_PREFS_FILE_NAME);
    const backupPath = path.join(dir, LEGACY_PREFS_BACKUP_FILE_NAME);
    const configPath = path.join(dir, CONFIG_FILE_NAME);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    try {
      writeFileSync(legacyPath, JSON.stringify({"desk-backup-retry": {themeKey: "mono"}}));
      mkdirSync(backupPath);

      const failed = new ConfigStore(dir);
      expect(failed.readOnlyReason).toContain("legacy migration failed");
      expect(existsSync(configPath)).toBe(false);

      rmSync(backupPath, {recursive: true});
      const retried = new ConfigStore(dir);
      expect(retried.readOnlyReason).toBeNull();
      expect(retried.getDeviceConfig("desk-backup-retry").appearance.themeKey).toBe("mono");
      expect(readJsonFile(backupPath)).toEqual({"desk-backup-retry": {themeKey: "mono"}});
      expect(readJsonFile(configPath)).toEqual(retried.getDocument());
    } finally {
      warn.mockRestore();
      log.mockRestore();
      rmSync(dir, {recursive: true, force: true});
    }
  });

  test.each([
    {name: "malformed JSON", contents: "{bad json", reason: new RegExp("Unexpected token|property name|JSON", "i")},
    {
      name: "unknown schema",
      contents: JSON.stringify({schemaVersion: 2, revision: 9, devices: {}}),
      reason: /unsupported schemaVersion: 2/,
    },
  ])("opens $name config read-only and refuses writes", ({contents, reason}) => {
    const dir = createTempDir();
    const configPath = path.join(dir, CONFIG_FILE_NAME);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    try {
      writeFileSync(configPath, contents);
      const store = new ConfigStore(dir);

      expect(store.readOnlyReason).toMatch(reason);
      expect(store.revision).toBe(0);
      expect(store.getDocument().devices).toEqual({});
      expect(() => store.patchDeviceConfig("desk-read-only", {appearance: {themeKey: "mono"}}, 0)).toThrow(
        ConfigStoreReadOnlyError,
      );
      store.flush();
      expect(readFileSync(configPath, "utf8")).toBe(contents);
    } finally {
      warn.mockRestore();
      rmSync(dir, {recursive: true, force: true});
    }
  });

  test("stores only published versions and rolls one device back without changing others", () => {
    const dir = createTempDir();

    try {
      const store = new ConfigStore(dir);
      store.patchDeviceConfig("desk-history", {appearance: {themeKey: "amber"}}, 0);
      store.patchDeviceConfig("desk-other", {appearance: {themeKey: "dusk"}}, 1);
      expect(store.listDeviceHistory("desk-history")).toEqual([]);

      store.publishDeviceConfig("desk-history", 2);
      expect(store.revision).toBe(3);
      expect(store.listDeviceHistory("desk-history")).toMatchObject([
        {revision: 3, config: {appearance: {themeKey: "amber"}}},
      ]);

      const historyDir = path.join(dir, CONFIG_HISTORY_DIR_NAME);
      const firstHistoryFiles = readdirSync(historyDir);
      expect(firstHistoryFiles).toHaveLength(1);
      expect(statSync(historyDir).mode & 0o777).toBe(0o700);
      expect(statSync(path.join(historyDir, firstHistoryFiles[0])).mode & 0o777).toBe(0o600);

      store.patchDeviceConfig("desk-history", {appearance: {themeKey: "sakura"}}, 3);
      expect(store.listDeviceHistory("desk-history").map((entry) => entry.revision)).toEqual([3]);
      store.publishDeviceConfig("desk-history", 4);
      expect(store.listDeviceHistory("desk-history")).toMatchObject([
        {revision: 5, config: {appearance: {themeKey: "sakura"}}},
        {revision: 3, config: {appearance: {themeKey: "amber"}}},
      ]);

      store.rollbackDeviceConfig("desk-history", 3, 5);
      expect(store.revision).toBe(6);
      expect(store.getDeviceConfig("desk-history").appearance.themeKey).toBe("amber");
      expect(store.getDeviceConfig("desk-other").appearance.themeKey).toBe("dusk");
      expect(store.listDeviceHistory("desk-history").map((entry) => entry.revision)).toEqual([5, 3]);
      expect(() => store.rollbackDeviceConfig("desk-history", 4, 6)).toThrow(ConfigHistoryRevisionNotFoundError);

      const reloaded = new ConfigStore(dir);
      expect(reloaded.revision).toBe(6);
      expect(reloaded.getDeviceConfig("desk-history").appearance.themeKey).toBe("amber");
      expect(reloaded.listDeviceHistory("desk-history").map((entry) => entry.revision)).toEqual([5, 3]);
    } finally {
      rmSync(dir, {recursive: true, force: true});
    }
  });

  test("starts a new published history after its directory is removed", () => {
    const dir = createTempDir();

    try {
      const store = new ConfigStore(dir);
      store.patchDeviceConfig("desk-history-missing", {appearance: {themeKey: "amber"}}, 0);
      store.publishDeviceConfig("desk-history-missing", 1);
      rmSync(path.join(dir, CONFIG_HISTORY_DIR_NAME), {recursive: true});

      const reloaded = new ConfigStore(dir);
      expect(reloaded.listDeviceHistory("desk-history-missing")).toEqual([]);
      reloaded.patchDeviceConfig("desk-history-missing", {appearance: {themeKey: "sakura"}}, 2);
      expect(reloaded.listDeviceHistory("desk-history-missing")).toEqual([]);
      reloaded.publishDeviceConfig("desk-history-missing", 3);
      expect(reloaded.listDeviceHistory("desk-history-missing")).toMatchObject([
        {revision: 4, config: {appearance: {themeKey: "sakura"}}},
      ]);
      expect(readdirSync(path.join(dir, CONFIG_HISTORY_DIR_NAME))).toHaveLength(1);
    } finally {
      rmSync(dir, {recursive: true, force: true});
    }
  });

  test("keeps repeated patches with unchanged values idempotent", () => {
    const store = new ConfigStore();

    store.patchDeviceConfig("desk-history-noop", {appearance: {themeKey: "amber"}}, 0);
    store.patchDeviceConfig("desk-history-noop", {appearance: {themeKey: "amber"}}, 1);

    expect(store.revision).toBe(1);
    expect(store.listDeviceHistory("desk-history-noop")).toEqual([]);
  });

  test("returns a detached current config and published history from one store read", () => {
    const store = new ConfigStore();
    store.patchDeviceConfig("desk-history-view", {appearance: {themeKey: "amber"}}, 0);
    store.publishDeviceConfig("desk-history-view", 1);

    const view = store.getDeviceHistory("desk-history-view");
    store.patchDeviceConfig("desk-history-view", {appearance: {themeKey: "sakura"}}, 2);

    expect(view).toMatchObject({
      currentRevision: 2,
      currentConfig: {appearance: {themeKey: "amber"}},
      entries: [{revision: 2, config: {appearance: {themeKey: "amber"}}}],
    });
    expect(store.getDeviceHistory("desk-history-view")).toMatchObject({
      currentRevision: 3,
      currentConfig: {appearance: {themeKey: "sakura"}},
      entries: [{revision: 2, config: {appearance: {themeKey: "amber"}}}],
    });
  });

  test("opens damaged published history read-only and reports the failure", () => {
    const dir = createTempDir();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    try {
      const store = new ConfigStore(dir);
      store.patchDeviceConfig("desk-history-damaged", {appearance: {themeKey: "amber"}}, 0);
      store.publishDeviceConfig("desk-history-damaged", 1);
      const historyDir = path.join(dir, CONFIG_HISTORY_DIR_NAME);
      const latest = readdirSync(historyDir).sort().at(-1)!;
      writeFileSync(path.join(historyDir, latest), "{bad json");

      const reloaded = new ConfigStore(dir);
      expect(reloaded.revision).toBe(2);
      expect(reloaded.readOnlyReason).toContain("config history cannot be read");
      expect(() => reloaded.listDeviceHistory("desk-history-damaged")).toThrow(ConfigStoreReadOnlyError);
      expect(() => reloaded.publishDeviceConfig("desk-history-damaged", 2)).toThrow(ConfigStoreReadOnlyError);
    } finally {
      warn.mockRestore();
      rmSync(dir, {recursive: true, force: true});
    }
  });

  test("removes legacy unpublished snapshots and keeps the published version", () => {
    const dir = createTempDir();
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    try {
      const store = new ConfigStore(dir);
      const baselineDocument = store.getDocument();
      store.patchDeviceConfig("desk-history-migration", {appearance: {themeKey: "amber"}}, 0);
      const patchDocument = store.getDocument();
      store.publishDeviceConfig("desk-history-migration", 1);
      store.patchDeviceConfig("desk-history-migration", {appearance: {themeKey: "sakura"}}, 2);
      const rollbackDocument = store.getDocument();
      const historyDir = path.join(dir, CONFIG_HISTORY_DIR_NAME);
      const legacySnapshots = [
        {revision: 0, operation: "baseline", deviceId: null, document: baselineDocument},
        {revision: 1, operation: "patch", deviceId: "desk-history-migration", document: patchDocument},
        {
          revision: 3,
          operation: "rollback",
          deviceId: "desk-history-migration",
          sourceRevision: 2,
          document: rollbackDocument,
        },
      ];
      for (const snapshot of legacySnapshots) {
        writeFileSync(
          path.join(historyDir, `${String(snapshot.revision).padStart(16, "0")}.json`),
          JSON.stringify({
            historySchemaVersion: 1,
            createdAt: new Date(`2026-08-23T00:00:0${snapshot.revision}.000Z`).toISOString(),
            ...snapshot,
          }),
        );
      }

      const reloaded = new ConfigStore(dir);
      expect(reloaded.readOnlyReason).toBeNull();
      expect(reloaded.revision).toBe(3);
      expect(reloaded.getDeviceConfig("desk-history-migration").appearance.themeKey).toBe("sakura");
      expect(reloaded.listDeviceHistory("desk-history-migration")).toMatchObject([
        {revision: 2, config: {appearance: {themeKey: "amber"}}},
      ]);
      expect(readdirSync(historyDir)).toEqual(["0000000000000002.json"]);

      reloaded.rollbackDeviceConfig("desk-history-migration", 2, 3);
      expect(reloaded.revision).toBe(4);
      expect(reloaded.getDeviceConfig("desk-history-migration").appearance.themeKey).toBe("amber");
      expect(reloaded.listDeviceHistory("desk-history-migration").map((entry) => entry.revision)).toEqual([2]);
      expect(readdirSync(historyDir)).toEqual(["0000000000000002.json"]);
    } finally {
      log.mockRestore();
      rmSync(dir, {recursive: true, force: true});
    }
  });

  test("removes a new history snapshot when publishing cannot save the config", () => {
    const dir = createTempDir();
    const configPath = path.join(dir, CONFIG_FILE_NAME);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    try {
      const store = new ConfigStore(dir);
      store.patchDeviceConfig("desk-publish-failure", {appearance: {themeKey: "amber"}}, 0);
      mkdirSync(`${configPath}.${process.pid}.tmp`);

      expect(() => store.publishDeviceConfig("desk-publish-failure", 1)).toThrow(ConfigStoreReadOnlyError);
      expect(store.revision).toBe(1);
      expect(store.listDeviceHistory("desk-publish-failure")).toEqual([]);
      expect((readJsonFile(configPath) as {revision: number}).revision).toBe(1);
      expect(readdirSync(path.join(dir, CONFIG_HISTORY_DIR_NAME))).toEqual([]);
    } finally {
      warn.mockRestore();
      rmSync(dir, {recursive: true, force: true});
    }
  });

  test("keeps the current config when a published snapshot cannot be written", () => {
    const dir = createTempDir();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    try {
      const store = new ConfigStore(dir);
      store.patchDeviceConfig("desk-history-write-failure", {appearance: {themeKey: "amber"}}, 0);
      const historyDir = path.join(dir, CONFIG_HISTORY_DIR_NAME);
      mkdirSync(historyDir);
      const snapshotPath = path.join(historyDir, "0000000000000002.json");
      mkdirSync(`${snapshotPath}.${process.pid}.tmp`);

      expect(() => store.publishDeviceConfig("desk-history-write-failure", 1)).toThrow(ConfigStoreReadOnlyError);
      expect(store.revision).toBe(1);
      expect(store.getDeviceConfig("desk-history-write-failure").appearance.themeKey).toBe("amber");
      expect(store.listDeviceHistory("desk-history-write-failure")).toEqual([]);
      expect(existsSync(snapshotPath)).toBe(false);
    } finally {
      warn.mockRestore();
      rmSync(dir, {recursive: true, force: true});
    }
  });

  test("retains the latest published versions", () => {
    const dir = createTempDir();

    try {
      const store = new ConfigStore(dir);
      for (let revision = 0; revision < CONFIG_HISTORY_LIMIT + 5; revision += 1) {
        store.publishDeviceConfig("desk-history-limit", revision);
      }

      const entries = store.listDeviceHistory("desk-history-limit");
      expect(entries).toHaveLength(CONFIG_HISTORY_LIMIT);
      expect(entries[0].revision).toBe(CONFIG_HISTORY_LIMIT + 5);
      expect(entries.at(-1)?.revision).toBe(6);
      expect(readdirSync(path.join(dir, CONFIG_HISTORY_DIR_NAME))).toHaveLength(CONFIG_HISTORY_LIMIT);

      const reloaded = new ConfigStore(dir);
      expect(reloaded.readOnlyReason).toBeNull();
      expect(reloaded.listDeviceHistory("desk-history-limit").map((entry) => entry.revision)).toEqual(
        entries.map((entry) => entry.revision),
      );
    } finally {
      rmSync(dir, {recursive: true, force: true});
    }
  });
});
