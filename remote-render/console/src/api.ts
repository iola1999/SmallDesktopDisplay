import type {
  Catalog,
  ConfigHistoryResponse,
  DeviceConfig,
  DeviceConfigDocument,
  DevicesResponse,
  GestureName,
  ServiceStatus,
} from "./types";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

async function request(path: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(path, init);
  if (response.ok) return response;

  let detail = `请求失败 (${response.status})`;
  try {
    const payload = (await response.json()) as {detail?: string};
    if (payload.detail) detail = payload.detail;
  } catch {
    // 错误响应可能没有 JSON 正文，保留状态码即可诊断。
  }
  throw new ApiError(detail, response.status);
}

export async function getCatalog(signal?: AbortSignal): Promise<Catalog> {
  return (await request("/api/v1/catalog", {signal})).json() as Promise<Catalog>;
}

export async function getDevices(signal?: AbortSignal): Promise<DevicesResponse> {
  return (await request("/api/v1/devices", {signal})).json() as Promise<DevicesResponse>;
}

export async function getServiceStatus(signal?: AbortSignal): Promise<ServiceStatus> {
  return (await request("/api/v1/status", {signal})).json() as Promise<ServiceStatus>;
}

function responseEtag(response: Response, revision: number): string {
  return response.headers.get("etag") ?? `"${revision}"`;
}

export async function getDeviceConfig(deviceId: string, signal?: AbortSignal): Promise<DeviceConfigDocument> {
  const response = await request(`/api/v1/devices/${encodeURIComponent(deviceId)}/config`, {signal});
  const document = (await response.json()) as Omit<DeviceConfigDocument, "etag">;
  return {...document, etag: responseEtag(response, document.revision)};
}

export async function saveDeviceConfig(
  deviceId: string,
  config: DeviceConfig,
  etag: string,
): Promise<DeviceConfigDocument> {
  const response = await request(`/api/v1/devices/${encodeURIComponent(deviceId)}/config`, {
    method: "PATCH",
    headers: {"content-type": "application/json", "if-match": etag},
    body: JSON.stringify(config),
  });
  const document = (await response.json()) as Omit<DeviceConfigDocument, "etag">;
  return {...document, etag: responseEtag(response, document.revision)};
}

export async function getConfigHistory(
  deviceId: string,
  signal?: AbortSignal,
): Promise<ConfigHistoryResponse> {
  return (
    await request(`/api/v1/devices/${encodeURIComponent(deviceId)}/config/history`, {signal})
  ).json() as Promise<ConfigHistoryResponse>;
}

export async function publishDeviceConfig(
  deviceId: string,
  etag: string,
): Promise<DeviceConfigDocument> {
  const response = await request(
    `/api/v1/devices/${encodeURIComponent(deviceId)}/config/publish`,
    {
      method: "POST",
      headers: {"content-type": "application/json", "if-match": etag},
      body: "{}",
    },
  );
  const document = (await response.json()) as Omit<DeviceConfigDocument, "etag">;
  return {...document, etag: responseEtag(response, document.revision)};
}

export async function rollbackDeviceConfig(
  deviceId: string,
  revision: number,
  etag: string,
): Promise<DeviceConfigDocument> {
  const response = await request(
    `/api/v1/devices/${encodeURIComponent(deviceId)}/config/rollback`,
    {
      method: "POST",
      headers: {"content-type": "application/json", "if-match": etag},
      body: JSON.stringify({revision}),
    },
  );
  const document = (await response.json()) as Omit<DeviceConfigDocument, "etag">;
  return {...document, etag: responseEtag(response, document.revision)};
}

export async function renderDraftPreview(
  deviceId: string,
  config: DeviceConfig,
  signal?: AbortSignal,
): Promise<Blob> {
  const response = await request(`/api/v1/devices/${encodeURIComponent(deviceId)}/preview`, {
    method: "POST",
    signal,
    headers: {"content-type": "application/json"},
    body: JSON.stringify({config}),
  });
  return response.blob();
}

export async function getLivePreview(deviceId: string, signal?: AbortSignal): Promise<Blob> {
  return (await request(`/api/v1/devices/${encodeURIComponent(deviceId)}/preview.png`, {signal})).blob();
}

export async function setBrightness(deviceId: string, brightness: number): Promise<void> {
  await request(`/api/v1/devices/${encodeURIComponent(deviceId)}/prefs`, {
    method: "POST",
    headers: {"content-type": "application/json"},
    body: JSON.stringify({brightness}),
  });
}

export async function sendGesture(deviceId: string, event: GestureName): Promise<void> {
  await request(`/api/v1/devices/${encodeURIComponent(deviceId)}/console-input`, {
    method: "POST",
    headers: {"content-type": "application/json"},
    body: JSON.stringify({event}),
  });
}
