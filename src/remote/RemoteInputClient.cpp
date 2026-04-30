#include "remote/RemoteInputClient.h"

#include <ESP8266HTTPClient.h>
#include <WiFiClient.h>

#include "AppConfig.h"

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

bool RemoteInputClient::postEvent(const String &baseUrl,
                                  const String &deviceId,
                                  uint32_t sequence,
                                  const char *eventName,
                                  uint32_t uptimeMs)
{
  WiFiClient client;
  HTTPClient http;
  http.setTimeout(app_config::kRemoteHttpTimeoutMs);

  const String url = joinUrl(baseUrl, "/api/v1/devices/" + deviceId + "/input");
  if (!http.begin(client, url))
  {
    return false;
  }

  http.addHeader("Content-Type", "application/json");
  const String body = String("{\"seq\":") + String(sequence) +
                      ",\"event\":\"" + eventName +
                      "\",\"uptime_ms\":" + String(uptimeMs) + "}";
  const int statusCode = http.POST(body);
  http.end();
  return statusCode == HTTP_CODE_ACCEPTED;
}

} // namespace remote
