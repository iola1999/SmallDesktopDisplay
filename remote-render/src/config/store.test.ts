import {existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import path from "node:path";

import {describe, expect, test, vi} from "vitest";

import {createDefaultDeviceConfig} from "./schema.js";
import {
  CONFIG_FILE_NAME,
  LEGACY_PREFS_BACKUP_FILE_NAME,
  LEGACY_PREFS_FILE_NAME,
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
});
