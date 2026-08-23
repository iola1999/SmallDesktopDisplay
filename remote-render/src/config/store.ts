import {
  constants,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
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
export const CONFIG_HISTORY_DIR_NAME = "remote-render-config-history";
export const CONFIG_HISTORY_LIMIT = 100;
export const LEGACY_PREFS_FILE_NAME = "device-prefs.json";
export const LEGACY_PREFS_BACKUP_FILE_NAME = "device-prefs.json.migrated.bak";

const CONFIG_HISTORY_SCHEMA_VERSION = 1 as const;
const HISTORY_OPERATIONS = ["baseline", "patch", "publish", "rollback"] as const;

type ConfigHistoryOperation = (typeof HISTORY_OPERATIONS)[number];

interface ConfigHistorySnapshot {
  historySchemaVersion: typeof CONFIG_HISTORY_SCHEMA_VERSION;
  revision: number;
  createdAt: string;
  operation: ConfigHistoryOperation;
  deviceId: string | null;
  sourceRevision?: number;
  document: ConfigDocument;
}

type PublishedConfigHistorySnapshot = ConfigHistorySnapshot & {
  operation: "publish";
  deviceId: string;
  sourceRevision?: never;
};

export interface DeviceConfigHistoryEntry {
  revision: number;
  createdAt: string;
  config: DeviceConfig;
}

export interface DeviceConfigHistoryView {
  currentRevision: number;
  currentConfig: DeviceConfig;
  entries: DeviceConfigHistoryEntry[];
}

export class ConfigRevisionConflictError extends Error {
  constructor(
    public expectedRevision: number,
    public currentRevision: number,
  ) {
    super(`revision conflict: expected ${expectedRevision}, current ${currentRevision}`);
  }
}

export class ConfigHistoryRevisionNotFoundError extends Error {
  constructor(public revision: number) {
    super(`config history revision not found: ${revision}`);
  }
}

export class ConfigStoreReadOnlyError extends Error {}

export class ConfigStore {
  private document: ConfigDocument;
  private readonly targetPath: string | null;
  private readonly historyDirPath: string | null;
  private history: PublishedConfigHistorySnapshot[] = [];
  private historyReadError: string | null = null;
  private readOnlyReasonValue: string | null = null;

  constructor(private readonly dir: string | null = null) {
    this.targetPath = dir === null ? null : path.join(dir, CONFIG_FILE_NAME);
    this.historyDirPath = dir === null ? null : path.join(dir, CONFIG_HISTORY_DIR_NAME);
    this.document = this.load();
    this.loadHistory();
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

  listDeviceHistory(deviceId: string): DeviceConfigHistoryEntry[] {
    return this.getDeviceHistory(deviceId).entries;
  }

  getDeviceHistory(deviceId: string): DeviceConfigHistoryView {
    this.assertHistoryReadable();
    if (!isValidDeviceId(deviceId)) {
      throw new ConfigValidationError("invalid device id");
    }
    const document = this.document;
    const entries = this.history
      .filter((snapshot) => snapshot.deviceId === deviceId)
      .map((snapshot) => ({
        revision: snapshot.revision,
        createdAt: snapshot.createdAt,
        config: cloneDeviceConfig(snapshot.document.devices[deviceId] ?? createDefaultDeviceConfig()),
      }))
      .reverse();
    return {
      currentRevision: document.revision,
      currentConfig: cloneDeviceConfig(document.devices[deviceId] ?? createDefaultDeviceConfig()),
      entries,
    };
  }

  patchDeviceConfig(deviceId: string, input: unknown, expectedRevision?: number): DeviceConfig {
    this.assertWritable();
    this.assertDeviceIdAndRevision(deviceId, expectedRevision);
    const patch = parseDeviceConfigPatch(input);
    const previous = this.getDeviceConfig(deviceId);
    const next = mergeDeviceConfig(previous, patch);
    if (JSON.stringify(previous) === JSON.stringify(next) && this.document.devices[deviceId] !== undefined) {
      return next;
    }
    const nextDocument = cloneConfigDocument(this.document);
    nextDocument.devices[deviceId] = next;
    this.commit(nextDocument);
    return cloneDeviceConfig(next);
  }

  publishDeviceConfig(deviceId: string, expectedRevision?: number): DeviceConfig {
    this.assertWritable();
    this.assertDeviceIdAndRevision(deviceId, expectedRevision);
    this.commit(cloneConfigDocument(this.document), deviceId);
    return this.getDeviceConfig(deviceId);
  }

  rollbackDeviceConfig(deviceId: string, sourceRevision: number, expectedRevision?: number): DeviceConfig {
    this.assertWritable();
    this.assertHistoryReadable();
    this.assertDeviceIdAndRevision(deviceId, expectedRevision);
    if (!Number.isSafeInteger(sourceRevision) || sourceRevision < 0) {
      throw new ConfigValidationError("revision must be a non-negative integer");
    }
    const source = this.history.find(
      (snapshot) => snapshot.revision === sourceRevision && snapshot.deviceId === deviceId,
    );
    if (source === undefined) {
      throw new ConfigHistoryRevisionNotFoundError(sourceRevision);
    }

    const nextDocument = cloneConfigDocument(this.document);
    if (Object.prototype.hasOwnProperty.call(source.document.devices, deviceId)) {
      nextDocument.devices[deviceId] = cloneDeviceConfig(source.document.devices[deviceId]);
    } else {
      delete nextDocument.devices[deviceId];
    }
    this.commit(nextDocument);
    return this.getDeviceConfig(deviceId);
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

  private loadHistory(): void {
    if (this.historyDirPath === null || !existsSync(this.historyDirPath) || this.readOnlyReasonValue !== null) return;
    try {
      if (!statSync(this.historyDirPath).isDirectory()) {
        throw new ConfigValidationError(`${CONFIG_HISTORY_DIR_NAME} must be a directory`);
      }
      const records = readdirSync(this.historyDirPath)
        .filter((name) => name.endsWith(".json"))
        .map((name) => {
          const match = /^(\d+)\.json$/.exec(name);
          if (match === null) throw new ConfigValidationError(`invalid config history filename: ${name}`);
          const snapshot = parseHistorySnapshot(JSON.parse(readFileSync(path.join(this.historyDirPath!, name), "utf8")));
          if (snapshot.revision !== Number(match[1])) {
            throw new ConfigValidationError(`config history filename revision mismatch: ${name}`);
          }
          if (snapshot.revision > this.document.revision) {
            throw new ConfigValidationError(
              `config history revision ${snapshot.revision} is newer than current revision ${this.document.revision}`,
            );
          }
          return {name, snapshot};
        })
        .sort((a, b) => a.snapshot.revision - b.snapshot.revision);
      const snapshots = records.map((record) => record.snapshot);
      for (let index = 1; index < snapshots.length; index += 1) {
        if (snapshots[index - 1].revision === snapshots[index].revision) {
          throw new ConfigValidationError(`duplicate config history revision: ${snapshots[index].revision}`);
        }
      }
      const unpublished = records.filter((record) => record.snapshot.operation !== "publish");
      for (const record of unpublished) {
        rmSync(path.join(this.historyDirPath, record.name));
      }
      if (unpublished.length > 0) {
        console.log(`[Config] removed ${unpublished.length} unpublished history snapshot(s)`);
      }
      this.history = snapshots.filter(isPublishedHistorySnapshot);
      this.pruneHistory();
    } catch (error) {
      this.history = [];
      this.historyReadError = `config history cannot be read: ${error instanceof Error ? error.message : String(error)}`;
      this.readOnlyReasonValue = this.historyReadError;
      console.warn(`[Config] ${this.historyReadError}`);
    }
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

  private assertHistoryReadable(): void {
    if (this.historyReadError !== null) {
      throw new ConfigStoreReadOnlyError(this.historyReadError);
    }
  }

  private assertDeviceIdAndRevision(deviceId: string, expectedRevision?: number): void {
    if (!isValidDeviceId(deviceId)) {
      throw new ConfigValidationError("invalid device id");
    }
    if (expectedRevision !== undefined && expectedRevision !== this.document.revision) {
      throw new ConfigRevisionConflictError(expectedRevision, this.document.revision);
    }
  }

  private commit(nextDocument: ConfigDocument, publishedDeviceId?: string): void {
    if (this.document.revision >= Number.MAX_SAFE_INTEGER) {
      this.readOnlyReasonValue = "config revision limit reached";
      throw new ConfigStoreReadOnlyError(this.readOnlyReasonValue);
    }
    nextDocument.revision = this.document.revision + 1;
    const snapshot = publishedDeviceId === undefined
      ? null
      : this.createPublishedHistorySnapshot(nextDocument, publishedDeviceId);

    if (this.targetPath !== null) {
      if (snapshot !== null) {
        try {
          this.writeHistorySnapshotAtomic(snapshot);
        } catch (error) {
          this.failWrite("config history save failed", error);
        }
      }
      try {
        this.writeDocumentAtomic(nextDocument);
      } catch (error) {
        if (snapshot !== null) this.removeHistorySnapshot(snapshot.revision);
        this.failWrite("config save failed", error);
      }
    }

    this.document = nextDocument;
    if (snapshot !== null) {
      this.history.push(snapshot);
      this.pruneHistoryAfterCommit();
    }
  }

  private createPublishedHistorySnapshot(
    document: ConfigDocument,
    deviceId: string,
  ): PublishedConfigHistorySnapshot {
    return {
      historySchemaVersion: CONFIG_HISTORY_SCHEMA_VERSION,
      revision: document.revision,
      createdAt: new Date().toISOString(),
      operation: "publish",
      deviceId,
      document: cloneConfigDocument(document),
    };
  }

  private failWrite(prefix: string, error: unknown): never {
    this.readOnlyReasonValue = `${prefix}: ${error instanceof Error ? error.message : String(error)}`;
    console.warn(`[Config] ${this.readOnlyReasonValue}`);
    throw new ConfigStoreReadOnlyError(this.readOnlyReasonValue);
  }

  private pruneHistoryAfterCommit(): void {
    try {
      this.pruneHistory();
    } catch (error) {
      this.readOnlyReasonValue = `config history prune failed: ${error instanceof Error ? error.message : String(error)}`;
      console.warn(`[Config] ${this.readOnlyReasonValue}`);
    }
  }

  private pruneHistory(): void {
    if (this.history.length <= CONFIG_HISTORY_LIMIT) return;

    const removed = this.history.slice(0, -CONFIG_HISTORY_LIMIT);

    for (const snapshot of removed) {
      if (this.historyDirPath !== null) {
        rmSync(this.historySnapshotPath(snapshot.revision));
      }
      const index = this.history.findIndex((candidate) => candidate.revision === snapshot.revision);
      if (index !== -1) this.history.splice(index, 1);
    }
  }

  private removeHistorySnapshot(revision: number): void {
    if (this.historyDirPath === null) return;
    try {
      rmSync(this.historySnapshotPath(revision), {force: true});
    } catch {
      // 下次启动会把高于主配置修订号的快照报告为未完成写入。
    }
  }

  private writeDocumentAtomic(document: ConfigDocument): void {
    if (this.targetPath === null || this.dir === null) return;
    mkdirSync(this.dir, {recursive: true});
    this.writeJsonAtomic(this.targetPath, document);
  }

  private writeHistorySnapshotAtomic(snapshot: ConfigHistorySnapshot): void {
    if (this.historyDirPath === null) return;
    mkdirSync(this.historyDirPath, {recursive: true, mode: 0o700});
    this.writeJsonAtomic(this.historySnapshotPath(snapshot.revision), snapshot);
  }

  private historySnapshotPath(revision: number): string {
    if (this.historyDirPath === null) throw new Error("config history is not persistent");
    return path.join(this.historyDirPath, `${String(revision).padStart(16, "0")}.json`);
  }

  private writeJsonAtomic(target: string, value: unknown): void {
    const temp = `${target}.${process.pid}.tmp`;
    try {
      writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, {encoding: "utf8", mode: 0o600});
      renameSync(temp, target);
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

function parseHistorySnapshot(value: unknown): ConfigHistorySnapshot {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ConfigValidationError("config history snapshot must be an object");
  }
  const snapshot = value as Record<string, unknown>;
  const knownKeys = [
    "historySchemaVersion",
    "revision",
    "createdAt",
    "operation",
    "deviceId",
    "sourceRevision",
    "document",
  ];
  const unknownKey = Object.keys(snapshot).find((key) => !knownKeys.includes(key));
  if (unknownKey !== undefined) throw new ConfigValidationError(`unknown config history field: ${unknownKey}`);
  if (snapshot.historySchemaVersion !== CONFIG_HISTORY_SCHEMA_VERSION) {
    throw new ConfigValidationError(`unsupported config history schema: ${String(snapshot.historySchemaVersion)}`);
  }
  if (!Number.isSafeInteger(snapshot.revision) || (snapshot.revision as number) < 0) {
    throw new ConfigValidationError("config history revision must be a non-negative integer");
  }
  if (
    typeof snapshot.createdAt !== "string" ||
    Number.isNaN(Date.parse(snapshot.createdAt)) ||
    new Date(snapshot.createdAt).toISOString() !== snapshot.createdAt
  ) {
    throw new ConfigValidationError("config history createdAt must be an ISO date");
  }
  if (typeof snapshot.operation !== "string" || !(HISTORY_OPERATIONS as readonly string[]).includes(snapshot.operation)) {
    throw new ConfigValidationError("unknown config history operation");
  }
  if (snapshot.deviceId !== null && (typeof snapshot.deviceId !== "string" || !isValidDeviceId(snapshot.deviceId))) {
    throw new ConfigValidationError("invalid config history device id");
  }
  if (
    snapshot.sourceRevision !== undefined &&
    (!Number.isSafeInteger(snapshot.sourceRevision) || (snapshot.sourceRevision as number) < 0)
  ) {
    throw new ConfigValidationError("config history source revision must be a non-negative integer");
  }
  if (snapshot.operation === "baseline" && snapshot.deviceId !== null) {
    throw new ConfigValidationError("config history baseline device id must be null");
  }
  if (snapshot.operation !== "baseline" && typeof snapshot.deviceId !== "string") {
    throw new ConfigValidationError("config history operation requires a device id");
  }
  if (snapshot.operation === "rollback" && snapshot.sourceRevision === undefined) {
    throw new ConfigValidationError("config history rollback requires a source revision");
  }
  if (snapshot.operation !== "rollback" && snapshot.sourceRevision !== undefined) {
    throw new ConfigValidationError("config history source revision is only valid for rollback");
  }
  if (typeof snapshot.sourceRevision === "number" && snapshot.sourceRevision >= (snapshot.revision as number)) {
    throw new ConfigValidationError("config history source revision must precede the rollback revision");
  }
  const document = parseConfigDocument(snapshot.document);
  if (document.revision !== snapshot.revision) {
    throw new ConfigValidationError("config history document revision mismatch");
  }
  return {
    historySchemaVersion: CONFIG_HISTORY_SCHEMA_VERSION,
    revision: snapshot.revision as number,
    createdAt: snapshot.createdAt,
    operation: snapshot.operation as ConfigHistoryOperation,
    deviceId: snapshot.deviceId as string | null,
    ...(snapshot.sourceRevision === undefined ? {} : {sourceRevision: snapshot.sourceRevision as number}),
    document,
  };
}

function isPublishedHistorySnapshot(snapshot: ConfigHistorySnapshot): snapshot is PublishedConfigHistorySnapshot {
  return snapshot.operation === "publish" && typeof snapshot.deviceId === "string";
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

export function configHistoryResponse(store: ConfigStore, deviceId: string): {
  schemaVersion: typeof CONFIG_SCHEMA_VERSION;
  deviceId: string;
  currentRevision: number;
  currentConfig: DeviceConfig;
  entries: DeviceConfigHistoryEntry[];
} {
  const history = store.getDeviceHistory(deviceId);
  return {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    deviceId,
    ...history,
  };
}
