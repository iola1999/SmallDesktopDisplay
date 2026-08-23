import {constants, copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync} from "node:fs";
import path from "node:path";

import {FONT_OPTIONS, THEME_OPTIONS} from "../ui-state.js";
import {
  CONFIG_SCHEMA_VERSION,
  type ConfigDocument,
  type DeviceConfig,
  type DeviceConfigPatch,
  ConfigValidationError,
  cloneConfigDocument,
  cloneDeviceConfig,
  createDefaultDeviceConfig,
  createEmptyConfigDocument,
  isValidDeviceId,
  mergeDeviceConfig,
  parseConfigDocument,
  parseDeviceConfigPatch,
} from "./schema.js";

export const CONFIG_FILE_NAME = "remote-render-config.json";
export const LEGACY_PREFS_FILE_NAME = "device-prefs.json";
export const LEGACY_PREFS_BACKUP_FILE_NAME = "device-prefs.json.migrated.bak";

export class ConfigRevisionConflictError extends Error {
  constructor(
    public expectedRevision: number,
    public currentRevision: number,
  ) {
    super(`revision conflict: expected ${expectedRevision}, current ${currentRevision}`);
  }
}

export class ConfigStoreReadOnlyError extends Error {}

export class ConfigStore {
  private document: ConfigDocument;
  private readonly targetPath: string | null;
  private readOnlyReasonValue: string | null = null;

  constructor(private readonly dir: string | null = null) {
    this.targetPath = dir === null ? null : path.join(dir, CONFIG_FILE_NAME);
    this.document = this.load();
  }

  get revision(): number {
    return this.document.revision;
  }

  get readOnlyReason(): string | null {
    return this.readOnlyReasonValue;
  }

  getDocument(): ConfigDocument {
    return cloneConfigDocument(this.document);
  }

  getDeviceConfig(deviceId: string): DeviceConfig {
    return cloneDeviceConfig(this.document.devices[deviceId] ?? createDefaultDeviceConfig());
  }

  listDeviceIds(): string[] {
    return Object.keys(this.document.devices);
  }

  patchDeviceConfig(deviceId: string, input: unknown, expectedRevision?: number): DeviceConfig {
    this.assertWritable();
    if (!isValidDeviceId(deviceId)) {
      throw new ConfigValidationError("invalid device id");
    }
    if (expectedRevision !== undefined && expectedRevision !== this.document.revision) {
      throw new ConfigRevisionConflictError(expectedRevision, this.document.revision);
    }
    const patch = parseDeviceConfigPatch(input);
    const previous = this.getDeviceConfig(deviceId);
    const next = mergeDeviceConfig(previous, patch);
    if (JSON.stringify(previous) === JSON.stringify(next) && this.document.devices[deviceId] !== undefined) {
      return next;
    }
    const nextDocument = cloneConfigDocument(this.document);
    nextDocument.devices[deviceId] = next;
    nextDocument.revision += 1;
    if (this.targetPath !== null) {
      try {
        this.writeDocumentAtomic(nextDocument);
      } catch (error) {
        this.readOnlyReasonValue = `config save failed: ${error instanceof Error ? error.message : String(error)}`;
        console.warn(`[Config] ${this.readOnlyReasonValue}`);
        throw new ConfigStoreReadOnlyError(this.readOnlyReasonValue);
      }
    }
    this.document = nextDocument;
    return cloneDeviceConfig(next);
  }

  replaceDeviceConfig(deviceId: string, config: DeviceConfig, expectedRevision?: number): DeviceConfig {
    return this.patchDeviceConfig(deviceId, config, expectedRevision);
  }

  updateDeviceAppearance(deviceId: string, appearance: DeviceConfigPatch["appearance"]): DeviceConfig {
    return this.patchDeviceConfig(deviceId, {appearance});
  }

  flush(): void {
    // 配置更新在返回成功前已经完成原子写入。
  }

  close(): void {
    this.flush();
  }

  private load(): ConfigDocument {
    if (this.targetPath === null || this.dir === null) {
      return createEmptyConfigDocument();
    }
    if (existsSync(this.targetPath)) {
      try {
        return parseConfigDocument(JSON.parse(readFileSync(this.targetPath, "utf8")));
      } catch (error) {
        this.readOnlyReasonValue = error instanceof Error ? error.message : String(error);
        console.warn(`[Config] ${CONFIG_FILE_NAME} is read-only: ${this.readOnlyReasonValue}`);
        return createEmptyConfigDocument();
      }
    }
    return this.migrateLegacyPrefs();
  }

  private migrateLegacyPrefs(): ConfigDocument {
    if (this.dir === null) return createEmptyConfigDocument();
    const source = path.join(this.dir, LEGACY_PREFS_FILE_NAME);
    if (!existsSync(source)) return createEmptyConfigDocument();
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(source, "utf8"));
    } catch (error) {
      this.readOnlyReasonValue = `legacy preferences cannot be read: ${error instanceof Error ? error.message : String(error)}`;
      console.warn(`[Config] ${this.readOnlyReasonValue}`);
      return createEmptyConfigDocument();
    }

    const document = createEmptyConfigDocument();
    if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
      for (const [deviceId, value] of Object.entries(raw)) {
        if (!isValidDeviceId(deviceId) || typeof value !== "object" || value === null || Array.isArray(value)) continue;
        const legacy = value as Record<string, unknown>;
        const config = createDefaultDeviceConfig();
        if (typeof legacy.themeKey === "string" && (THEME_OPTIONS as readonly string[]).includes(legacy.themeKey)) {
          config.appearance.themeKey = legacy.themeKey;
        }
        if (typeof legacy.fontKey === "string" && (FONT_OPTIONS as readonly string[]).includes(legacy.fontKey)) {
          config.appearance.fontKey = legacy.fontKey;
        }
        document.devices[deviceId] = config;
      }
    }

    try {
      const backup = path.join(this.dir, LEGACY_PREFS_BACKUP_FILE_NAME);
      try {
        copyFileSync(source, backup, constants.COPYFILE_EXCL);
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== "EEXIST") throw error;
        if (!statSync(backup).isFile()) throw error;
      }
      this.writeDocumentAtomic(document);
      console.log(`[Config] migrated ${Object.keys(document.devices).length} device(s) from ${LEGACY_PREFS_FILE_NAME}`);
    } catch (error) {
      this.readOnlyReasonValue = `legacy migration failed: ${error instanceof Error ? error.message : String(error)}`;
      console.warn(`[Config] ${this.readOnlyReasonValue}`);
    }
    return document;
  }

  private assertWritable(): void {
    if (this.readOnlyReasonValue !== null) {
      throw new ConfigStoreReadOnlyError(this.readOnlyReasonValue);
    }
  }

  private writeDocumentAtomic(document: ConfigDocument): void {
    if (this.targetPath === null || this.dir === null) return;
    mkdirSync(this.dir, {recursive: true});
    const temp = `${this.targetPath}.${process.pid}.tmp`;
    try {
      writeFileSync(temp, `${JSON.stringify(document, null, 2)}\n`, {encoding: "utf8", mode: 0o600});
      renameSync(temp, this.targetPath);
    } catch (error) {
      try {
        rmSync(temp, {force: true});
      } catch {
        // 临时路径若为目录等未知类型则保留原状，防止清理未知目录。
      }
      throw error;
    }
  }
}

export function configResponse(store: ConfigStore, deviceId: string): {
  schemaVersion: typeof CONFIG_SCHEMA_VERSION;
  revision: number;
  deviceId: string;
  config: DeviceConfig;
} {
  return {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    revision: store.revision,
    deviceId,
    config: store.getDeviceConfig(deviceId),
  };
}
