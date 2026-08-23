import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  Check,
  Clock3,
  CloudSun,
  Home,
  LayoutDashboard,
  LoaderCircle,
  Monitor,
  MousePointer2,
  Palette,
  RefreshCw,
  RotateCcw,
  Save,
  Server,
  SunMedium,
  Wifi,
  WifiOff,
} from "lucide-react";
import {AnimatePresence, motion} from "motion/react";
import {useEffect, useReducer, useRef, useState, type Dispatch, type ReactNode} from "react";

import {
  ApiError,
  getCatalog,
  getDeviceConfig,
  getDevices,
  getLivePreview,
  getServiceStatus,
  renderDraftPreview,
  saveDeviceConfig,
  sendGesture,
  setBrightness,
} from "./api";
import {draftReducer, initialDraftState} from "./draft";
import type {
  Catalog,
  ConsoleSection,
  DeviceConfig,
  DeviceSummary,
  GestureName,
  HomeLayout,
  ServiceStatus,
} from "./types";

const DEVICE_STORAGE_KEY = "sdd-console-device-v1";

const NAV_ITEMS: ReadonlyArray<{
  key: ConsoleSection;
  label: string;
  icon: typeof Monitor;
}> = [
  {key: "devices", label: "设备", icon: Monitor},
  {key: "home", label: "首页", icon: Home},
  {key: "appearance", label: "外观", icon: Palette},
  {key: "diagnostics", label: "诊断", icon: Activity},
];

const SECTION_TITLES: Record<ConsoleSection, string> = {
  devices: "设备",
  home: "首页",
  appearance: "外观",
  diagnostics: "诊断",
};

const HOME_FLAG_LABELS = {
  header: [
    {key: "showDate", label: "日期"},
    {key: "showLunar", label: "农历"},
  ],
  weather: [
    {key: "showCurrent", label: "当前天气"},
    {key: "showTodayRange", label: "今日高低温"},
    {key: "showDailyOutlook", label: "明后天预报"},
  ],
} as const;

function lastSeenSeconds(device: DeviceSummary): number | null {
  return device.lastSeenSeconds ?? device.lastCommunicationSeconds ?? null;
}

function deviceIsOnline(device: DeviceSummary): boolean {
  const lastSeen = lastSeenSeconds(device);
  return device.online ?? (lastSeen !== null && lastSeen <= 15);
}

function humanAge(seconds: number): string {
  if (seconds < 5) return "刚刚";
  if (seconds < 60) return `${seconds} 秒前`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟前`;
  return `${Math.floor(seconds / 3600)} 小时前`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function formatUptime(milliseconds: number): string {
  const minutes = Math.floor(milliseconds / 60_000);
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时 ${minutes % 60} 分钟`;
  return `${Math.floor(hours / 24)} 天 ${hours % 24} 小时`;
}

interface BrightnessDraft {
  deviceId: string;
  baseline: number;
  value: number;
  dirty: boolean;
}

type OperationResult<T> = {ok: true; value: T} | {ok: false; error: unknown} | null;

interface SaveRequest {
  deviceId: string;
  config?: {value: DeviceConfig; etag: string};
  brightness?: number;
}

interface SaveResult {
  request: SaveRequest;
  config: OperationResult<Awaited<ReturnType<typeof saveDeviceConfig>>>;
  brightness: OperationResult<void>;
}

const EMPTY_BRIGHTNESS_DRAFT: BrightnessDraft = {
  deviceId: "",
  baseline: 0,
  value: 0,
  dirty: false,
};

function brightnessDraftFor(device?: DeviceSummary): BrightnessDraft {
  if (!device) return EMPTY_BRIGHTNESS_DRAFT;
  return {
    deviceId: device.deviceId,
    baseline: device.brightness,
    value: device.brightness,
    dirty: false,
  };
}

async function settle<T>(promise: Promise<T>): Promise<OperationResult<T>> {
  try {
    return {ok: true, value: await promise};
  } catch (error) {
    return {ok: false, error};
  }
}

function communicationLabel(device: DeviceSummary): string {
  const seconds = lastSeenSeconds(device);
  return seconds === null ? "尚未通信" : `${humanAge(seconds)}通信`;
}

function errorMessage(error: unknown): string {
  if (error instanceof TypeError) return "无法连接渲染服务";
  return error instanceof Error ? error.message : "请求失败";
}

function useObjectUrl(blob: Blob | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }
    const nextUrl = URL.createObjectURL(blob);
    setUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [blob]);
  return url;
}

export function App() {
  const queryClient = useQueryClient();
  const [section, setSection] = useState<ConsoleSection>("home");
  const [selectedDeviceId, setSelectedDeviceId] = useState(
    () => localStorage.getItem(DEVICE_STORAGE_KEY) ?? "",
  );
  const [pendingDeviceId, setPendingDeviceId] = useState<string | null>(null);
  const [draft, dispatch] = useReducer(draftReducer, initialDraftState);
  const [brightnessDraft, setBrightnessDraft] = useState<BrightnessDraft>(EMPTY_BRIGHTNESS_DRAFT);
  const [toast, setToast] = useState<string | null>(null);
  const observedConfigRevision = useRef<number | null>(null);

  const catalogQuery = useQuery({
    queryKey: ["catalog"],
    queryFn: ({signal}) => getCatalog(signal),
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  });
  const devicesQuery = useQuery({
    queryKey: ["devices"],
    queryFn: ({signal}) => getDevices(signal),
    refetchInterval: 5_000,
  });
  const statusQuery = useQuery({
    queryKey: ["status"],
    queryFn: ({signal}) => getServiceStatus(signal),
    refetchInterval: 5_000,
  });
  const configQuery = useQuery({
    queryKey: ["device-config", selectedDeviceId],
    queryFn: ({signal}) => getDeviceConfig(selectedDeviceId, signal),
    enabled: selectedDeviceId.length > 0,
    refetchInterval: 10_000,
  });

  const devices = devicesQuery.data?.devices ?? [];
  const selectedDevice = devices.find((device) => device.deviceId === selectedDeviceId);
  const activeConfig =
    draft.document?.deviceId === selectedDeviceId ? draft.config : null;
  const brightnessDirty =
    brightnessDraft.deviceId === selectedDeviceId && brightnessDraft.dirty;
  const brightnessValue =
    brightnessDraft.deviceId === selectedDeviceId
      ? brightnessDraft.value
      : (selectedDevice?.brightness ?? 0);
  const hasUnsavedChanges = draft.dirty || brightnessDirty;

  useEffect(() => {
    if (devicesQuery.isPending || devicesQuery.isError) return;
    if (devices.length === 0) {
      if (selectedDeviceId && !hasUnsavedChanges) {
        setSelectedDeviceId("");
        dispatch({type: "clear"});
        setBrightnessDraft(EMPTY_BRIGHTNESS_DRAFT);
      }
      return;
    }
    if (!devices.some((device) => device.deviceId === selectedDeviceId) && !hasUnsavedChanges) {
      const nextDeviceId = devices[0].deviceId;
      setSelectedDeviceId(nextDeviceId);
      localStorage.setItem(DEVICE_STORAGE_KEY, nextDeviceId);
      dispatch({type: "clear"});
      setBrightnessDraft(EMPTY_BRIGHTNESS_DRAFT);
    }
  }, [devices, devicesQuery.isError, devicesQuery.isPending, hasUnsavedChanges, selectedDeviceId]);

  useEffect(() => {
    if (configQuery.data) dispatch({type: "hydrate", document: configQuery.data});
  }, [configQuery.data]);

  useEffect(() => {
    const revision = statusQuery.data?.config?.revision;
    if (revision === undefined) return;
    if (observedConfigRevision.current === null) {
      observedConfigRevision.current = revision;
      return;
    }
    if (observedConfigRevision.current === revision) return;
    observedConfigRevision.current = revision;
    queryClient.removeQueries({
      queryKey: ["device-config"],
      predicate: (query) => query.queryKey[1] !== selectedDeviceId,
    });
    if (selectedDeviceId) {
      void queryClient.invalidateQueries({queryKey: ["device-config", selectedDeviceId]});
    }
  }, [queryClient, selectedDeviceId, statusQuery.data?.config?.revision]);

  useEffect(() => {
    setBrightnessDraft((current) => {
      if (!selectedDevice) {
        return current.deviceId === selectedDeviceId && current.dirty
          ? current
          : EMPTY_BRIGHTNESS_DRAFT;
      }
      if (current.deviceId !== selectedDevice.deviceId) return brightnessDraftFor(selectedDevice);
      if (current.dirty || current.baseline === selectedDevice.brightness) return current;
      return brightnessDraftFor(selectedDevice);
    });
  }, [selectedDevice?.brightness, selectedDevice?.deviceId, selectedDeviceId]);

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const saveMutation = useMutation({
    onMutate: async (input: SaveRequest) => {
      await queryClient.cancelQueries({queryKey: ["device-config", input.deviceId]});
    },
    mutationFn: async (input: SaveRequest): Promise<SaveResult> => {
      const [config, brightness] = await Promise.all([
        input.config
          ? settle(saveDeviceConfig(input.deviceId, input.config.value, input.config.etag))
          : Promise.resolve(null),
        input.brightness === undefined
          ? Promise.resolve(null)
          : settle(setBrightness(input.deviceId, input.brightness)),
      ]);
      return {request: input, config, brightness};
    },
    onSuccess: async (result) => {
      const failures: unknown[] = [];
      let configSaved = false;
      let brightnessSent = false;

      if (result.config?.ok) {
        const document = result.config.value;
        await queryClient.cancelQueries({queryKey: ["device-config", document.deviceId]});
        queryClient.removeQueries({
          queryKey: ["device-config"],
          predicate: (query) => query.queryKey[1] !== document.deviceId,
        });
        queryClient.setQueryData(["device-config", document.deviceId], document);
        if (document.deviceId === selectedDeviceId) dispatch({type: "saved", document});
        configSaved = true;
      } else if (result.config && !result.config.ok) {
        if (result.config.error instanceof ApiError && result.config.error.status === 409) {
          if (result.request.deviceId === selectedDeviceId) dispatch({type: "conflict", value: true});
        } else {
          failures.push(result.config.error);
        }
      }

      if (result.brightness?.ok) {
        const sentValue = result.request.brightness!;
        setBrightnessDraft((current) => {
          if (current.deviceId !== result.request.deviceId) return current;
          return {
            ...current,
            baseline: sentValue,
            dirty: current.value !== sentValue,
          };
        });
        brightnessSent = true;
      } else if (result.brightness && !result.brightness.ok) {
        failures.push(result.brightness.error);
      }

      if (failures.length > 0) {
        setToast(errorMessage(failures[0]));
      } else if (configSaved && brightnessSent) {
        setToast("修改已应用");
      } else if (configSaved) {
        setToast("配置已应用");
      } else if (brightnessSent) {
        setToast("亮度指令已发送");
      }

      const invalidations: Array<Promise<unknown>> = [];
      if (configSaved || brightnessSent) {
        invalidations.push(queryClient.invalidateQueries({queryKey: ["devices"]}));
      }
      if (configSaved) {
        invalidations.push(
          queryClient.invalidateQueries({queryKey: ["preview", "live", result.request.deviceId]}),
        );
      }
      await Promise.all(invalidations);
    },
  });

  const applyDraft = () => {
    if (!selectedDeviceId || !hasUnsavedChanges || saveMutation.isPending) return;
    const config =
      draft.dirty && draft.document && activeConfig
        ? {value: activeConfig, etag: draft.document.etag}
        : undefined;
    const brightness = brightnessDirty ? brightnessDraft.value : undefined;
    if (!config && brightness === undefined) return;
    saveMutation.mutate({deviceId: selectedDeviceId, config, brightness});
  };

  const cancelDraft = () => {
    dispatch({type: "reset"});
    setBrightnessDraft(brightnessDraftFor(selectedDevice));
  };

  const reloadAfterConflict = async () => {
    const result = await configQuery.refetch();
    if (!result.isSuccess || !result.data) {
      setToast(errorMessage(result.error));
      return;
    }
    dispatch({type: "rebase", document: result.data});
    setToast("已读取最新配置，本地修改仍保留");
  };

  const changeDevice = (deviceId: string) => {
    if (saveMutation.isPending) return;
    setSelectedDeviceId(deviceId);
    localStorage.setItem(DEVICE_STORAGE_KEY, deviceId);
    dispatch({type: "clear"});
    setBrightnessDraft(EMPTY_BRIGHTNESS_DRAFT);
    setPendingDeviceId(null);
  };

  const requestDeviceChange = (deviceId: string) => {
    if (deviceId === selectedDeviceId || saveMutation.isPending) return;
    if (hasUnsavedChanges) {
      setPendingDeviceId(deviceId);
      return;
    }
    changeDevice(deviceId);
  };

  const refreshAll = async () => {
    if (saveMutation.isPending) return;
    const results = await Promise.all([
      catalogQuery.refetch(),
      devicesQuery.refetch(),
      statusQuery.refetch(),
      ...(selectedDeviceId ? [configQuery.refetch()] : []),
    ]);
    setToast(results.some((result) => result.isError) ? "部分数据刷新失败" : "状态已刷新");
  };

  const dataError =
    devicesQuery.error ?? catalogQuery.error ?? statusQuery.error ?? configQuery.error;

  return (
    <div className="app-shell">
      <Sidebar
        devices={devices}
        devicesLoading={devicesQuery.isPending}
        deviceSwitchingDisabled={saveMutation.isPending}
        selectedDeviceId={selectedDeviceId}
        section={section}
        onDeviceChange={requestDeviceChange}
        onSectionChange={setSection}
      />

      <main className={`editor-pane ${hasUnsavedChanges ? "has-draft" : ""}`}>
        <div className="editor-inner">
          <header className="page-header">
            <div>
              <div className="title-line">
                <h1>{SECTION_TITLES[section]}</h1>
                {hasUnsavedChanges ? <span className="draft-badge">草稿</span> : null}
              </div>
            </div>
            <IconButton
              label="刷新控制台数据"
              onClick={refreshAll}
              disabled={saveMutation.isPending}
              busy={catalogQuery.isFetching || devicesQuery.isFetching || statusQuery.isFetching}
            >
              <RefreshCw size={16} />
            </IconButton>
          </header>

          {dataError ? (
            <ErrorBanner message={errorMessage(dataError)} onRetry={refreshAll} />
          ) : null}
          {statusQuery.data?.config?.writable === false ? (
            <ConfigWarningBanner message={statusQuery.data.config.error ?? "配置存储当前只读"} />
          ) : null}
          {draft.conflict ? <ConflictBanner onReload={reloadAfterConflict} /> : null}

          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={section}
              className="section-motion"
              initial={{opacity: 0, y: 4}}
              animate={{opacity: 1, y: 0}}
              exit={{opacity: 0, y: -3}}
              transition={{duration: 0.14}}
            >
              {section === "devices" ? (
                <DevicesPanel
                  devices={devices}
                  disabled={saveMutation.isPending}
                  loading={devicesQuery.isPending}
                  selectedDeviceId={selectedDeviceId}
                  onSelect={requestDeviceChange}
                />
              ) : null}
              {section === "home" ? (
                <HomePanel
                  catalog={catalogQuery.data}
                  config={activeConfig}
                  controlsDisabled={saveMutation.isPending}
                  loading={configQuery.isPending || catalogQuery.isPending}
                  hasDevice={Boolean(selectedDeviceId)}
                  dispatch={dispatch}
                />
              ) : null}
              {section === "appearance" ? (
                <AppearancePanel
                  catalog={catalogQuery.data}
                  config={activeConfig}
                  device={selectedDevice}
                  brightness={brightnessValue}
                  brightnessDirty={brightnessDirty}
                  controlsDisabled={saveMutation.isPending}
                  loading={configQuery.isPending || catalogQuery.isPending}
                  dispatch={dispatch}
                  onBrightnessChange={(value) =>
                    setBrightnessDraft((current) => ({
                      deviceId: selectedDeviceId,
                      baseline:
                        current.deviceId === selectedDeviceId
                          ? current.baseline
                          : (selectedDevice?.brightness ?? value),
                      value,
                      dirty:
                        value !==
                        (current.deviceId === selectedDeviceId
                          ? current.baseline
                          : (selectedDevice?.brightness ?? value)),
                    }))
                  }
                />
              ) : null}
              {section === "diagnostics" ? (
                <DiagnosticsPanel
                  device={selectedDevice}
                  status={statusQuery.data}
                  loading={statusQuery.isPending}
                  statusError={statusQuery.isError}
                />
              ) : null}
            </motion.div>
          </AnimatePresence>
        </div>

        <ActionBar
          dirty={hasUnsavedChanges}
          disabled={(draft.dirty && !activeConfig) || draft.conflict}
          saving={saveMutation.isPending}
          onCancel={cancelDraft}
          onApply={applyDraft}
        />
      </main>

      <PreviewPanel
        device={selectedDevice}
        config={activeConfig}
        dirty={draft.dirty}
        interactionDisabled={saveMutation.isPending}
        onFeedback={setToast}
      />

      <AnimatePresence>
        {pendingDeviceId ? (
          <DiscardDialog
            onCancel={() => setPendingDeviceId(null)}
            onDiscard={() => changeDevice(pendingDeviceId)}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {toast ? (
          <motion.div
            className="toast"
            role="status"
            initial={{opacity: 0, y: 6}}
            animate={{opacity: 1, y: 0}}
            exit={{opacity: 0, y: 4}}
          >
            {toast}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

interface SidebarProps {
  devices: DeviceSummary[];
  devicesLoading: boolean;
  deviceSwitchingDisabled: boolean;
  selectedDeviceId: string;
  section: ConsoleSection;
  onDeviceChange(deviceId: string): void;
  onSectionChange(section: ConsoleSection): void;
}

function Sidebar({
  devices,
  devicesLoading,
  deviceSwitchingDisabled,
  selectedDeviceId,
  section,
  onDeviceChange,
  onSectionChange,
}: SidebarProps) {
  const currentDevice = devices.find((device) => device.deviceId === selectedDeviceId);
  return (
    <aside className="sidebar">
      <div className="brand-row">
        <span className="brand-mark" aria-hidden="true">
          <Monitor size={17} />
        </span>
        <span className="brand-copy">
          <strong>SmallDesktopDisplay</strong>
          <small>本地控制台</small>
        </span>
      </div>

      <label className="device-select-label" htmlFor="device-select">
        当前设备
      </label>
      <div className="select-wrap">
        <span
          className={`status-dot ${currentDevice && deviceIsOnline(currentDevice) ? "online" : ""}`}
          aria-hidden="true"
        />
        <select
          id="device-select"
          value={selectedDeviceId}
          disabled={devicesLoading || devices.length === 0 || deviceSwitchingDisabled}
          onChange={(event) => onDeviceChange(event.target.value)}
        >
          {devices.length === 0 ? <option value="">暂无设备</option> : null}
          {devices.map((device) => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.deviceId}
            </option>
          ))}
        </select>
      </div>

      <nav className="primary-nav" aria-label="控制台区域">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              type="button"
              className={section === item.key ? "active" : ""}
              aria-current={section === item.key ? "page" : undefined}
              onClick={() => onSectionChange(item.key)}
            >
              <Icon size={16} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

function DevicesPanel({
  devices,
  disabled,
  loading,
  selectedDeviceId,
  onSelect,
}: {
  devices: DeviceSummary[];
  disabled: boolean;
  loading: boolean;
  selectedDeviceId: string;
  onSelect(deviceId: string): void;
}) {
  if (loading) return <PanelSkeleton rows={3} />;
  if (devices.length === 0) {
    return <EmptyState icon={Monitor} title="暂无设备" detail="设备连接渲染服务后会显示在这里。" />;
  }
  return (
    <section className="settings-section" aria-labelledby="device-list-title">
      <SectionHeading id="device-list-title" title="显示设备" detail={`${devices.length} 台设备`} />
      <div className="device-list">
        {devices.map((device) => {
          const online = deviceIsOnline(device);
          return (
            <button
              className={`device-row ${device.deviceId === selectedDeviceId ? "selected" : ""}`}
              key={device.deviceId}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(device.deviceId)}
            >
              <span className="device-icon">
                {online ? <Wifi size={17} /> : <WifiOff size={17} />}
              </span>
              <span className="device-row-main">
                <strong>{device.deviceId}</strong>
                <small>{device.page} · 帧 #{device.frameId} · {communicationLabel(device)}</small>
              </span>
              <span className={`status-label ${online ? "online" : ""}`}>
                {online ? "在线" : "离线"}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function HomePanel({
  catalog,
  config,
  controlsDisabled,
  loading,
  hasDevice,
  dispatch,
}: {
  catalog?: Catalog;
  config: DeviceConfig | null;
  controlsDisabled: boolean;
  loading: boolean;
  hasDevice: boolean;
  dispatch: Dispatch<Parameters<typeof draftReducer>[1]>;
}) {
  if (!hasDevice) {
    return <EmptyState icon={Home} title="请选择设备" detail="首页配置按设备保存。" />;
  }
  if (loading || !catalog || !config) return <PanelSkeleton rows={6} />;

  return (
    <>
      <section className="settings-section" aria-labelledby="layout-title">
        <SectionHeading id="layout-title" title="布局" detail="240 × 240" />
        <div className="segmented layout-segments" role="group" aria-label="首页布局">
          {catalog.homeLayouts.map((layout) => {
            const selected = config.home.layout === layout.key;
            const Icon = layout.key === "clock" ? Clock3 : layout.key === "weather" ? CloudSun : LayoutDashboard;
            return (
              <button
                key={layout.key}
                type="button"
                aria-pressed={selected}
                className={selected ? "selected" : ""}
                disabled={controlsDisabled}
                onClick={() => dispatch({type: "set-layout", value: layout.key})}
              >
                <Icon size={17} />
                <span>
                  <strong>{layout.label}</strong>
                  <small>{layout.description}</small>
                </span>
                {selected ? <Check size={15} className="selection-check" /> : null}
              </button>
            );
          })}
        </div>
      </section>

      <section className="settings-section" aria-labelledby="header-title">
        <SectionHeading id="header-title" title="日期" />
        <div className="toggle-list">
          {HOME_FLAG_LABELS.header.map((item) => (
            <ToggleRow
              key={item.key}
              label={item.label}
              checked={Boolean(config.home.header[item.key])}
              disabled={controlsDisabled}
              onChange={(value) =>
                dispatch({type: "set-home-flag", group: "header", key: item.key, value})
              }
            />
          ))}
        </div>
      </section>

      <section className="settings-section" aria-labelledby="weather-title">
        <SectionHeading id="weather-title" title="天气" />
        <div className="toggle-list">
          {HOME_FLAG_LABELS.weather.map((item) => (
            <ToggleRow
              key={item.key}
              label={item.label}
              checked={Boolean(config.home.weather[item.key])}
              disabled={controlsDisabled}
              onChange={(value) =>
                dispatch({type: "set-home-flag", group: "weather", key: item.key, value})
              }
            />
          ))}
        </div>
      </section>
    </>
  );
}

function AppearancePanel({
  catalog,
  config,
  device,
  brightness,
  brightnessDirty,
  controlsDisabled,
  loading,
  dispatch,
  onBrightnessChange,
}: {
  catalog?: Catalog;
  config: DeviceConfig | null;
  device?: DeviceSummary;
  brightness: number;
  brightnessDirty: boolean;
  controlsDisabled: boolean;
  loading: boolean;
  dispatch: Dispatch<Parameters<typeof draftReducer>[1]>;
  onBrightnessChange(value: number): void;
}) {
  if (!device) {
    return <EmptyState icon={Palette} title="请选择设备" detail="外观配置按设备保存。" />;
  }
  if (loading || !catalog || !config) return <PanelSkeleton rows={6} />;

  return (
    <>
      <section className="settings-section" aria-labelledby="theme-title">
        <SectionHeading id="theme-title" title="主题" />
        <div className="option-grid" role="group" aria-label="屏幕主题">
          {catalog.themes.map((theme) => {
            const selected = config.appearance.themeKey === theme.key;
            return (
              <button
                key={theme.key}
                type="button"
                aria-pressed={selected}
                className={`theme-option ${selected ? "selected" : ""}`}
                disabled={controlsDisabled}
                onClick={() => dispatch({type: "set-theme", value: theme.key})}
              >
                <span className="theme-swatch" style={{backgroundColor: theme.color}} />
                <span>{theme.label}</span>
                {selected ? <Check size={15} /> : null}
              </button>
            );
          })}
        </div>
      </section>

      <section className="settings-section" aria-labelledby="font-title">
        <SectionHeading id="font-title" title="字体" />
        <div className="segmented font-segments" role="group" aria-label="屏幕字体">
          {catalog.fonts.map((font) => (
            <button
              key={font.key}
              type="button"
              aria-pressed={config.appearance.fontKey === font.key}
              className={config.appearance.fontKey === font.key ? "selected" : ""}
              disabled={controlsDisabled}
              onClick={() => dispatch({type: "set-font", value: font.key})}
            >
              {font.label}
            </button>
          ))}
        </div>
      </section>

      <section className="settings-section" aria-labelledby="brightness-title">
        <SectionHeading
          id="brightness-title"
          title="亮度"
          detail={brightnessDirty ? "等待应用" : "保存在设备中"}
        />
        <div className="brightness-control">
          <SunMedium size={17} />
          <input
            type="range"
            min={catalog.brightness.min}
            max={catalog.brightness.max}
            step={catalog.brightness.step}
            value={brightness}
            aria-label="屏幕亮度"
            disabled={controlsDisabled}
            onChange={(event) => onBrightnessChange(Number(event.target.value))}
          />
          <output>{brightness}%</output>
        </div>
      </section>
    </>
  );
}

function DiagnosticsPanel({
  device,
  status,
  loading,
  statusError,
}: {
  device?: DeviceSummary;
  status?: ServiceStatus;
  loading: boolean;
  statusError: boolean;
}) {
  if (loading) return <PanelSkeleton rows={5} />;
  const weather = status?.weather;
  const weatherValue = statusError
    ? "状态不可用"
    : weather?.hasData
      ? `${weather.location ?? "天气"} · ${humanAge(weather.ageSeconds ?? 0)}更新`
      : "等待天气数据";
  const diagnostics = device?.diagnostics;
  const configStatus = status?.config;
  const configValue = statusError
    ? "状态不可用"
    : configStatus
      ? configStatus.writable
        ? `可写 · 修订 ${configStatus.revision}`
        : `只读 · ${configStatus.error ?? "写入不可用"}`
      : "未报告";

  return (
    <>
      <section className="settings-section" aria-labelledby="service-title">
        <SectionHeading id="service-title" title="渲染服务" />
        <dl className="diagnostic-list">
          <DiagnosticRow
            icon={Server}
            label="服务"
            value={statusError || !status ? "状态不可用" : "运行中"}
            good={Boolean(status) && !statusError}
          />
          <DiagnosticRow
            icon={CloudSun}
            label="天气"
            value={weatherValue}
            good={!statusError && Boolean(weather?.hasData)}
          />
          <DiagnosticRow
            icon={Monitor}
            label="设备数"
            value={statusError ? "状态不可用" : status?.deviceCount === undefined ? "未报告" : `${status.deviceCount}`}
          />
          <DiagnosticRow
            icon={Save}
            label="配置存储"
            value={configValue}
            good={Boolean(configStatus?.writable)}
          />
        </dl>
      </section>

      <section className="settings-section" aria-labelledby="device-diagnostics-title">
        <SectionHeading id="device-diagnostics-title" title="当前设备" />
        {device ? (
          <dl className="diagnostic-list">
            <DiagnosticRow
              icon={deviceIsOnline(device) ? Wifi : WifiOff}
              label="连接"
              value={deviceIsOnline(device) ? "在线" : "离线"}
              good={deviceIsOnline(device)}
            />
            <DiagnosticRow icon={Home} label="页面" value={device.page} />
            <DiagnosticRow icon={Activity} label="帧序号" value={`#${device.frameId}`} />
            <DiagnosticRow
              icon={Clock3}
              label="最近通信"
              value={lastSeenSeconds(device) === null ? "尚未通信" : humanAge(lastSeenSeconds(device)!)}
            />
            <DiagnosticRow
              icon={Activity}
              label="可用内存"
              value={diagnostics?.heapFree === undefined ? "未报告" : formatBytes(diagnostics.heapFree)}
            />
            <DiagnosticRow
              icon={Activity}
              label="最大内存块"
              value={diagnostics?.heapMaxBlock === undefined ? "未报告" : formatBytes(diagnostics.heapMaxBlock)}
            />
            <DiagnosticRow
              icon={Activity}
              label="内存碎片率"
              value={diagnostics?.heapFragmentation === undefined ? "未报告" : `${diagnostics.heapFragmentation}%`}
            />
            <DiagnosticRow
              icon={Wifi}
              label="Wi-Fi RSSI"
              value={diagnostics?.wifiRssi === undefined ? "未报告" : `${diagnostics.wifiRssi} dBm`}
            />
            <DiagnosticRow
              icon={Clock3}
              label="运行时间"
              value={diagnostics ? formatUptime(diagnostics.uptimeMs) : "未报告"}
            />
          </dl>
        ) : (
          <div className="inline-empty">请选择设备</div>
        )}
      </section>
    </>
  );
}

function PreviewPanel({
  device,
  config,
  dirty,
  interactionDisabled,
  onFeedback,
}: {
  device?: DeviceSummary;
  config: DeviceConfig | null;
  dirty: boolean;
  interactionDisabled: boolean;
  onFeedback(message: string): void;
}) {
  const queryClient = useQueryClient();
  const deviceId = device?.deviceId ?? "";
  const livePreviewQuery = useQuery({
    queryKey: ["preview", "live", deviceId],
    queryFn: ({signal}) => getLivePreview(deviceId, signal),
    enabled: Boolean(deviceId) && !dirty,
    refetchInterval: dirty ? false : 1_000,
    placeholderData: (previousData, previousQuery) =>
      previousQuery?.queryKey[2] === deviceId ? previousData : undefined,
    retry: 1,
  });
  const draftPreviewQuery = useQuery({
    queryKey: ["preview", "draft", deviceId, config],
    queryFn: ({signal}) => renderDraftPreview(deviceId, config!, signal),
    enabled: Boolean(deviceId) && Boolean(config) && dirty,
    placeholderData: (previousData, previousQuery) =>
      previousQuery?.queryKey[2] === deviceId ? previousData : undefined,
    retry: 1,
  });
  const activeQuery = dirty ? draftPreviewQuery : livePreviewQuery;
  const previewUrl = useObjectUrl(dirty ? (draftPreviewQuery.data ?? livePreviewQuery.data) : livePreviewQuery.data);
  const gestureMutation = useMutation({
    mutationFn: (event: GestureName) => sendGesture(deviceId, event),
    onSuccess: async () => {
      onFeedback("设备输入已发送");
      await queryClient.invalidateQueries({queryKey: ["preview", "live", deviceId]});
    },
    onError: (error) => onFeedback(errorMessage(error)),
  });

  return (
    <aside className="preview-pane" aria-label="屏幕预览">
      <div className="preview-header">
        <div>
          <h2>屏幕预览</h2>
          <span>{device?.deviceId ?? "未选择设备"}</span>
        </div>
        {device ? (
          <span className={`preview-mode ${dirty ? "draft" : ""}`}>
            <span />
            {dirty ? "草稿" : "实时"}
          </span>
        ) : null}
      </div>

      <div className="preview-stage">
        {device ? (
          <motion.div
            className="screen-frame"
            animate={{opacity: previewUrl || !activeQuery.isFetching ? 1 : 0.76}}
            transition={{duration: 0.12}}
          >
            {previewUrl ? <img src={previewUrl} alt={`${device.deviceId} 屏幕预览`} /> : null}
            {!previewUrl && activeQuery.isPending ? <PreviewPlaceholder /> : null}
            {activeQuery.isError ? (
              <div className="preview-error">
                <AlertTriangle size={20} />
                <span>预览加载失败</span>
                <button
                  type="button"
                  className="preview-retry"
                  aria-label="重新加载预览"
                  onClick={() => activeQuery.refetch()}
                >
                  <RefreshCw size={15} />
                </button>
              </div>
            ) : null}
          </motion.div>
        ) : (
          <div className="preview-empty">
            <Monitor size={28} />
            <span>等待设备连接</span>
          </div>
        )}
      </div>

      <div className="gesture-controls" aria-label="模拟设备按键">
        <GestureButton
          label="短按"
          event="short_press"
          busy={gestureMutation.isPending && gestureMutation.variables === "short_press"}
          disabled={!device || gestureMutation.isPending || interactionDisabled}
          onClick={(event) => gestureMutation.mutate(event)}
        />
        <GestureButton
          label="双击"
          event="double_press"
          busy={gestureMutation.isPending && gestureMutation.variables === "double_press"}
          disabled={!device || gestureMutation.isPending || interactionDisabled}
          onClick={(event) => gestureMutation.mutate(event)}
        />
        <GestureButton
          label="长按"
          event="long_press"
          busy={gestureMutation.isPending && gestureMutation.variables === "long_press"}
          disabled={!device || gestureMutation.isPending || interactionDisabled}
          onClick={(event) => gestureMutation.mutate(event)}
        />
      </div>

      {device ? (
        <dl className="preview-meta">
          <div>
            <dt>当前页面</dt>
            <dd>{device.page}</dd>
          </div>
          <div>
            <dt>亮度</dt>
            <dd>{device.brightness}%</dd>
          </div>
          <div>
            <dt>帧序号</dt>
            <dd>#{device.frameId}</dd>
          </div>
        </dl>
      ) : null}
    </aside>
  );
}

function ActionBar({
  dirty,
  disabled,
  saving,
  onCancel,
  onApply,
}: {
  dirty: boolean;
  disabled: boolean;
  saving: boolean;
  onCancel(): void;
  onApply(): void;
}) {
  return (
    <div className={`action-bar ${dirty ? "visible" : ""}`} aria-live="polite">
      <span className="action-status">
        {dirty ? <span className="unsaved-dot" /> : <Check size={15} />}
        {dirty ? "有未应用的修改" : "配置已同步"}
      </span>
      <div className="action-buttons">
        <button type="button" className="button secondary" disabled={!dirty || saving} onClick={onCancel}>
          <RotateCcw size={15} />
          取消
        </button>
        <button type="button" className="button primary" disabled={!dirty || disabled || saving} onClick={onApply}>
          {saving ? <LoaderCircle className="spin" size={15} /> : <Save size={15} />}
          {saving ? "应用中" : "应用"}
        </button>
      </div>
    </div>
  );
}

function GestureButton({
  label,
  event,
  busy,
  disabled,
  onClick,
}: {
  label: string;
  event: GestureName;
  busy: boolean;
  disabled: boolean;
  onClick(event: GestureName): void;
}) {
  return (
    <button type="button" className="gesture-button" disabled={disabled} onClick={() => onClick(event)}>
      {busy ? <LoaderCircle className="spin" size={16} /> : event === "long_press" ? <Clock3 size={16} /> : <MousePointer2 size={16} />}
      {label}
    </button>
  );
}

function ToggleRow({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange(value: boolean): void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className="toggle-row"
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span>
        <strong>{label}</strong>
      </span>
      <span className={`switch ${checked ? "checked" : ""}`} aria-hidden="true">
        <motion.span layout transition={{duration: 0.12}} />
      </span>
    </button>
  );
}

function DiagnosticRow({
  icon: Icon,
  label,
  value,
  good,
}: {
  icon: typeof Monitor;
  label: string;
  value: string;
  good?: boolean;
}) {
  return (
    <div>
      <dt>
        <Icon size={15} />
        {label}
      </dt>
      <dd className={good ? "good" : ""}>{value}</dd>
    </div>
  );
}

function SectionHeading({id, title, detail}: {id: string; title: string; detail?: string}) {
  return (
    <div className="section-heading">
      <h2 id={id}>{title}</h2>
      {detail ? <span>{detail}</span> : null}
    </div>
  );
}

function IconButton({
  label,
  onClick,
  busy,
  disabled,
  children,
}: {
  label: string;
  onClick(): void;
  busy?: boolean;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="icon-button tooltip"
      aria-label={label}
      data-tooltip={label}
      disabled={busy || disabled}
      onClick={onClick}
    >
      {busy ? <LoaderCircle className="spin" size={16} /> : children}
    </button>
  );
}

function ErrorBanner({message, onRetry}: {message: string; onRetry(): void}) {
  return (
    <div className="alert error" role="alert">
      <AlertTriangle size={17} />
      <span>{message}</span>
      <button type="button" onClick={onRetry}>
        重试
      </button>
    </div>
  );
}

function ConfigWarningBanner({message}: {message: string}) {
  return (
    <div className="alert warning" role="alert">
      <AlertTriangle size={17} />
      <span>配置存储只读：{message}</span>
    </div>
  );
}

function ConflictBanner({onReload}: {onReload(): void}) {
  return (
    <div className="alert warning" role="alert">
      <AlertTriangle size={17} />
      <span>配置已有更新。读取最新版本时会保留本地修改。</span>
      <button type="button" onClick={onReload}>
        读取最新版本
      </button>
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  detail,
}: {
  icon: typeof Monitor;
  title: string;
  detail: string;
}) {
  return (
    <div className="empty-state">
      <Icon size={24} />
      <strong>{title}</strong>
      <span>{detail}</span>
    </div>
  );
}

function PanelSkeleton({rows}: {rows: number}) {
  return (
    <div className="skeleton-panel" aria-label="加载中" aria-busy="true">
      <span className="skeleton title" />
      {Array.from({length: rows}, (_, index) => (
        <span className="skeleton row" key={index} />
      ))}
    </div>
  );
}

function PreviewPlaceholder() {
  return (
    <div className="preview-placeholder" aria-label="预览加载中">
      <LoaderCircle className="spin" size={22} />
    </div>
  );
}

function DiscardDialog({onCancel, onDiscard}: {onCancel(): void; onDiscard(): void}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousBodyOverflow = document.body.style.overflow;
    const background = Array.from(
      document.querySelectorAll<HTMLElement>(".sidebar, .editor-pane, .preview-pane"),
    );
    const previousInert = background.map((element) => element.inert);
    background.forEach((element) => {
      element.inert = true;
    });
    document.body.style.overflow = "hidden";

    const focusFrame = window.requestAnimationFrame(() => {
      dialogRef.current?.querySelector<HTMLElement>("button")?.focus();
    });
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancelRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKeyDown);
      background.forEach((element, index) => {
        element.inert = previousInert[index];
      });
      document.body.style.overflow = previousBodyOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  return (
    <motion.div className="dialog-backdrop" initial={{opacity: 0}} animate={{opacity: 1}} exit={{opacity: 0}}>
      <motion.div
        className="dialog"
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="discard-title"
        aria-describedby="discard-description"
        initial={{opacity: 0, y: 6}}
        animate={{opacity: 1, y: 0}}
        exit={{opacity: 0, y: 4}}
      >
        <AlertTriangle size={20} />
        <h2 id="discard-title">放弃当前修改？</h2>
        <p id="discard-description">切换设备会清除当前的本地修改。</p>
        <div className="dialog-actions">
          <button type="button" className="button secondary" autoFocus onClick={onCancel}>
            继续编辑
          </button>
          <button type="button" className="button primary" onClick={onDiscard}>
            放弃并切换
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
