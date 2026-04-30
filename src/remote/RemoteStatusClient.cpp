#include "remote/RemoteStatusClient.h"

#include <ESP8266HTTPClient.h>
#include <WiFiClient.h>

#include "AppConfig.h"
#include "remote/DeviceStatusPayload.h"

namespace remote
{

namespace
{

String joinUrl(const String &baseUrl, const String &path)
{
  String normalized = baseUrl;
  while (normalized.endsWith("/"))
  {
    normalized.remove(normalized.length() - 1);
  }
  return normalized + path;
}

} // namespace

bool RemoteStatusClient::postStatus(const String &baseUrl, const String &deviceId, uint8_t brightness,
                                    uint32_t uptimeMs, uint32_t heapFree, uint32_t heapMaxBlock,
                                    uint8_t heapFragmentation, int16_t wifiRssi)
{
  char body[160];
  if (!buildDeviceStatusPayload(brightness, uptimeMs, heapFree, heapMaxBlock, heapFragmentation, wifiRssi, body,
                                sizeof(body)))
  {
    return false;
  }

  WiFiClient client;
  HTTPClient http;
  http.setTimeout(app_config::kRemoteHttpTimeoutMs);

  const String url = joinUrl(baseUrl, "/api/v1/devices/" + deviceId + "/status");
  if (!http.begin(client, url))
  {
    return false;
  }

  http.addHeader("Content-Type", "application/json");
  const int statusCode = http.POST(reinterpret_cast<const uint8_t *>(body), strlen(body));
  http.end();
  return statusCode == HTTP_CODE_ACCEPTED;
}

} // namespace remote
