#include "remote/RemoteCommandClient.h"

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

CommandFetchResult RemoteCommandClient::fetchLatest(const String &baseUrl, const String &deviceId,
                                                    uint32_t afterCommandId, DeviceCommand &outCommand)
{
  WiFiClient client;
  HTTPClient http;
  http.setTimeout(app_config::kRemoteHttpTimeoutMs);

  const String url = joinUrl(baseUrl, "/api/v1/devices/" + deviceId + "/commands?after=" + String(afterCommandId));
  if (!http.begin(client, url))
  {
    return CommandFetchResult::Failed;
  }

  const int statusCode = http.GET();
  if (statusCode == HTTP_CODE_NO_CONTENT)
  {
    http.end();
    return CommandFetchResult::NotModified;
  }
  if (statusCode != HTTP_CODE_OK)
  {
    Serial.printf("[RemoteCommand] http status %d\n", statusCode);
    http.end();
    return CommandFetchResult::Failed;
  }

  const String body = http.getString();
  http.end();
  if (!parseDeviceCommand(body.c_str(), outCommand) || outCommand.id <= afterCommandId)
  {
    Serial.println(F("[RemoteCommand] invalid command body"));
    return CommandFetchResult::Failed;
  }

  return CommandFetchResult::Updated;
}

} // namespace remote
