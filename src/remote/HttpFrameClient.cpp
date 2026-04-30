#include "remote/HttpFrameClient.h"

#include <algorithm>

#include <ESP8266HTTPClient.h>
#include <WiFiClient.h>

#include "AppConfig.h"
#include "app/FrameDiagnostics.h"

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

bool rectFitsFrame(const FrameHeader &frame, const RectHeader &rect)
{
  return rect.x + rect.width <= frame.width && rect.y + rect.height <= frame.height;
}

} // namespace

FrameFetchResult HttpFrameClient::fetchLatest(const String &baseUrl, const String &deviceId, uint32_t haveFrameId,
                                              uint32_t waitMs, uint32_t &outFrameId)
{
  WiFiClient client;
  HTTPClient http;
  http.setTimeout(app_config::kRemoteHttpTimeoutMs);

  app::FrameDiagnostics diagnostics;
  const uint32_t requestStartedMs = millis();
  const String url = joinUrl(baseUrl, "/api/v1/devices/" + deviceId + "/frame?have=" + String(haveFrameId) +
                                          "&wait_ms=" + String(waitMs));
  if (!http.begin(client, url))
  {
    return FrameFetchResult::Failed;
  }

  const int statusCode = http.GET();
  diagnostics.httpMs = millis() - requestStartedMs;
  if (statusCode == HTTP_CODE_NO_CONTENT)
  {
    http.end();
    return FrameFetchResult::NotModified;
  }
  if (statusCode != HTTP_CODE_OK)
  {
    Serial.printf("[RemoteFrame] http status %d\n", statusCode);
    http.end();
    return FrameFetchResult::Failed;
  }

  WiFiClient &stream = http.getStream();
  stream.setTimeout(app_config::kRemoteHttpTimeoutMs);

  uint8_t headerBytes[kFrameHeaderSize];
  FrameHeader header;
  if (!readExact(stream, headerBytes, sizeof(headerBytes), diagnostics.headerMs) ||
      !parseFrameHeader(headerBytes, sizeof(headerBytes), header))
  {
    Serial.println(F("[RemoteFrame] invalid frame header"));
    http.end();
    return FrameFetchResult::Failed;
  }

  if (!header.fullFrame && header.baseFrameId != haveFrameId)
  {
    Serial.printf("[RemoteFrame] stale partial base=%lu have=%lu frame=%lu\n",
                  static_cast<unsigned long>(header.baseFrameId), static_cast<unsigned long>(haveFrameId),
                  static_cast<unsigned long>(header.frameId));
    http.end();
    return FrameFetchResult::Failed;
  }

  if (!consumeFrame(stream, header, diagnostics))
  {
    Serial.println(F("[RemoteFrame] invalid frame body"));
    http.end();
    return FrameFetchResult::Failed;
  }
  diagnostics.totalMs = millis() - requestStartedMs;
  if (app::shouldLogFrameDiagnostics(header.fullFrame, header.payloadLength, header.rectCount))
  {
    Serial.printf("[RemoteFrame] frame=%lu %s rects=%u payload=%lu http_ms=%lu header_ms=%lu read_ms=%lu "
                  "tft_ms=%lu other_ms=%lu total_ms=%lu\n",
                  static_cast<unsigned long>(header.frameId), header.fullFrame ? "full" : "partial", header.rectCount,
                  static_cast<unsigned long>(header.payloadLength), static_cast<unsigned long>(diagnostics.httpMs),
                  static_cast<unsigned long>(diagnostics.headerMs), static_cast<unsigned long>(diagnostics.readMs),
                  static_cast<unsigned long>(diagnostics.tftMs),
                  static_cast<unsigned long>(app::frameOtherMs(diagnostics)),
                  static_cast<unsigned long>(diagnostics.totalMs));
  }

  outFrameId = header.frameId;
  http.end();
  return FrameFetchResult::Updated;
}

bool HttpFrameClient::readExact(Stream &stream, uint8_t *buffer, std::size_t length)
{
  uint32_t unusedElapsedMs = 0;
  return readExact(stream, buffer, length, unusedElapsedMs);
}

bool HttpFrameClient::readExact(Stream &stream, uint8_t *buffer, std::size_t length, uint32_t &elapsedMs)
{
  std::size_t offset = 0;
  const uint32_t startedMs = millis();
  while (offset < length)
  {
    const int count = stream.readBytes(reinterpret_cast<char *>(buffer + offset), length - offset);
    if (count <= 0)
    {
      elapsedMs += millis() - startedMs;
      return false;
    }
    offset += static_cast<std::size_t>(count);
  }
  elapsedMs += millis() - startedMs;
  return true;
}

bool HttpFrameClient::consumeFrame(Stream &stream, const FrameHeader &header, app::FrameDiagnostics &diagnostics)
{
  constexpr uint16_t kMaxBatchRows = 4;
  uint32_t crc = crc32Begin();
  uint32_t remainingPayload = header.payloadLength;
  uint16_t rowBuffer[240 * kMaxBatchRows];

  for (uint16_t index = 0; index < header.rectCount; ++index)
  {
    uint8_t rectBytes[kRectHeaderSize];
    RectHeader rect;
    if (!readExact(stream, rectBytes, sizeof(rectBytes), diagnostics.readMs) ||
        !parseRectHeader(rectBytes, sizeof(rectBytes), rect) || !rectFitsFrame(header, rect))
    {
      return false;
    }

    crc = crc32Update(crc, rectBytes, sizeof(rectBytes));
    const uint32_t expectedPayload = static_cast<uint32_t>(rect.width) * rect.height * 2U;
    if (rect.payloadLength != expectedPayload || rect.payloadLength > remainingPayload || rect.width > 240)
    {
      return false;
    }

    const std::size_t rowBytes = static_cast<std::size_t>(rect.width) * 2U;
    for (uint16_t row = 0; row < rect.height;)
    {
      const uint16_t rowsThisBatch = std::min<uint16_t>(kMaxBatchRows, rect.height - row);
      const std::size_t batchBytes = rowBytes * rowsThisBatch;
      uint8_t *rowData = reinterpret_cast<uint8_t *>(rowBuffer);
      if (!readExact(stream, rowData, batchBytes, diagnostics.readMs))
      {
        return false;
      }
      crc = crc32Update(crc, rowData, batchBytes);
      const uint32_t tftStartedMs = millis();
      sink_.drawRgb565Block(rect.x, rect.y + row, rect.width, rowsThisBatch, rowBuffer);
      diagnostics.tftMs += millis() - tftStartedMs;
      row += rowsThisBatch;
    }

    remainingPayload -= rect.payloadLength;
  }

  return remainingPayload == 0 && crc32Finish(crc) == header.crc32;
}

} // namespace remote
