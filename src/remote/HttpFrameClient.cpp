#include "remote/HttpFrameClient.h"

#include <algorithm>
#include <cstdint>
#include <cstdlib>
#include <string>

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

uint32_t parseHeaderMs(const String &value)
{
  if (value.length() == 0)
  {
    return 0;
  }

  char *end = nullptr;
  const unsigned long parsed = std::strtoul(value.c_str(), &end, 10);
  if (end == value.c_str())
  {
    return 0;
  }
  return parsed > UINT32_MAX ? UINT32_MAX : static_cast<uint32_t>(parsed);
}

} // namespace

HttpFrameClient::~HttpFrameClient()
{
  resetConnection();
}

FrameFetchResult HttpFrameClient::fetchLatest(const String &baseUrl, const String &deviceId, uint32_t haveFrameId,
                                              uint32_t waitMs, uint32_t &outFrameId)
{
  if (keepAlivePolicy_.shouldResetBeforeRequest(baseUrl.c_str()))
  {
    resetConnection();
  }

  http_.setReuse(true);
  http_.setTimeout(app_config::kRemoteHttpTimeoutMs);

  app::FrameDiagnostics diagnostics;
  const uint32_t requestStartedMs = millis();
  const String url = joinUrl(baseUrl, "/api/v1/devices/" + deviceId + "/frame?have=" + String(haveFrameId) +
                                          "&wait_ms=" + String(waitMs));
  const uint32_t beginStartedMs = millis();
  if (!http_.begin(client_, url))
  {
    resetConnection();
    return FrameFetchResult::Failed;
  }
  diagnostics.beginMs = millis() - beginStartedMs;

  static const char *kTimingHeaders[] = {
      "X-SDD-Server-Wait-Ms",
      "X-SDD-Server-Render-Ms",
      "X-SDD-Server-Total-Ms",
  };
  http_.collectHeaders(kTimingHeaders, 3);

  const uint32_t getStartedMs = millis();
  const int statusCode = http_.GET();
  diagnostics.getMs = millis() - getStartedMs;
  diagnostics.serverWaitMs = parseHeaderMs(http_.header("X-SDD-Server-Wait-Ms"));
  diagnostics.serverRenderMs = parseHeaderMs(http_.header("X-SDD-Server-Render-Ms"));
  diagnostics.serverTotalMs = parseHeaderMs(http_.header("X-SDD-Server-Total-Ms"));
  if (statusCode == HTTP_CODE_NO_CONTENT)
  {
    keepAlivePolicy_.rememberSuccessfulRequest(baseUrl.c_str());
    http_.end();
    return FrameFetchResult::NotModified;
  }
  if (statusCode != HTTP_CODE_OK)
  {
    Serial.printf("[RemoteFrame] http status %d\n", statusCode);
    resetConnection();
    return FrameFetchResult::Failed;
  }

  WiFiClient &stream = http_.getStream();
  stream.setTimeout(app_config::kRemoteHttpTimeoutMs);

  uint8_t headerBytes[kFrameHeaderSize];
  FrameHeader header;
  if (!readExact(stream, headerBytes, sizeof(headerBytes), diagnostics.headerMs) ||
      !parseFrameHeader(headerBytes, sizeof(headerBytes), header))
  {
    Serial.println(F("[RemoteFrame] invalid frame header"));
    resetConnection();
    return FrameFetchResult::Failed;
  }

  if (!header.fullFrame && header.baseFrameId != haveFrameId)
  {
    Serial.printf("[RemoteFrame] stale partial base=%lu have=%lu frame=%lu\n",
                  static_cast<unsigned long>(header.baseFrameId), static_cast<unsigned long>(haveFrameId),
                  static_cast<unsigned long>(header.frameId));
    resetConnection();
    return FrameFetchResult::Failed;
  }

  if (!consumeFrame(stream, header, diagnostics))
  {
    Serial.println(F("[RemoteFrame] invalid frame body"));
    resetConnection();
    return FrameFetchResult::Failed;
  }
  diagnostics.totalMs = millis() - requestStartedMs;
  if (app::shouldLogFrameDiagnostics(header.fullFrame, header.payloadLength, header.rectCount))
  {
    Serial.printf(
        "[RemoteFrame] frame=%lu %s rects=%u payload=%lu begin_ms=%lu get_ms=%lu header_ms=%lu "
        "srv_wait_ms=%lu srv_render_ms=%lu srv_total_ms=%lu client_overhead_ms=%lu read_ms=%lu "
        "stream_reads=%lu stream_bytes=%lu tft_ms=%lu tft_calls=%lu other_ms=%lu total_ms=%lu\n",
        static_cast<unsigned long>(header.frameId), header.fullFrame ? "full" : "partial", header.rectCount,
        static_cast<unsigned long>(header.payloadLength), static_cast<unsigned long>(diagnostics.beginMs),
        static_cast<unsigned long>(diagnostics.getMs), static_cast<unsigned long>(diagnostics.headerMs),
        static_cast<unsigned long>(diagnostics.serverWaitMs), static_cast<unsigned long>(diagnostics.serverRenderMs),
        static_cast<unsigned long>(diagnostics.serverTotalMs),
        static_cast<unsigned long>(app::frameClientOverheadMs(diagnostics)),
        static_cast<unsigned long>(diagnostics.readMs), static_cast<unsigned long>(diagnostics.streamReads),
        static_cast<unsigned long>(diagnostics.streamBytes), static_cast<unsigned long>(diagnostics.tftMs),
        static_cast<unsigned long>(diagnostics.tftCalls), static_cast<unsigned long>(app::frameOtherMs(diagnostics)),
        static_cast<unsigned long>(diagnostics.totalMs));
  }

  outFrameId = header.frameId;
  keepAlivePolicy_.rememberSuccessfulRequest(baseUrl.c_str());
  http_.end();
  return FrameFetchResult::Updated;
}

void HttpFrameClient::resetConnection()
{
  http_.setReuse(false);
  http_.end();
  client_.stop();
  keepAlivePolicy_.clear();
}

bool HttpFrameClient::readExact(WiFiClient &stream, uint8_t *buffer, std::size_t length)
{
  uint32_t unusedElapsedMs = 0;
  return readExact(stream, buffer, length, unusedElapsedMs);
}

bool HttpFrameClient::readExact(WiFiClient &stream, uint8_t *buffer, std::size_t length, uint32_t &elapsedMs)
{
  app::FrameDiagnostics unusedDiagnostics;
  return readExact(stream, buffer, length, elapsedMs, unusedDiagnostics);
}

bool HttpFrameClient::readExact(WiFiClient &stream, uint8_t *buffer, std::size_t length, uint32_t &elapsedMs,
                                app::FrameDiagnostics &diagnostics)
{
  std::size_t offset = 0;
  const uint32_t startedMs = millis();
  uint32_t lastProgressMs = startedMs;
  ++diagnostics.streamReads;
  diagnostics.streamBytes += static_cast<uint32_t>(length);
  while (offset < length)
  {
    const int available = stream.available();
    if (available <= 0)
    {
      if (millis() - lastProgressMs >= app_config::kRemoteHttpTimeoutMs)
      {
        elapsedMs += millis() - startedMs;
        return false;
      }
      ESP.wdtFeed();
      optimistic_yield(1000);
      continue;
    }

    const std::size_t requested = std::min<std::size_t>(length - offset, static_cast<std::size_t>(available));
    const int count = stream.read(buffer + offset, requested);
    if (count <= 0)
    {
      ESP.wdtFeed();
      optimistic_yield(1000);
      continue;
    }
    offset += static_cast<std::size_t>(count);
    lastProgressMs = millis();
  }
  elapsedMs += millis() - startedMs;
  return true;
}

bool HttpFrameClient::consumeFrame(WiFiClient &stream, const FrameHeader &header, app::FrameDiagnostics &diagnostics)
{
  constexpr uint16_t kMaxBatchRows = 2;
  uint32_t crc = crc32Begin();
  uint32_t remainingPayload = header.payloadLength;
  uint16_t rowBuffer[240 * kMaxBatchRows];

  for (uint16_t index = 0; index < header.rectCount; ++index)
  {
    uint8_t rectBytes[kRectHeaderSize];
    RectHeader rect;
    if (!readExact(stream, rectBytes, sizeof(rectBytes), diagnostics.readMs, diagnostics) ||
        !parseRectHeader(rectBytes, sizeof(rectBytes), rect) || !rectFitsFrame(header, rect))
    {
      return false;
    }

    crc = crc32Update(crc, rectBytes, sizeof(rectBytes));
    const uint32_t expectedPayload = static_cast<uint32_t>(rect.width) * rect.height * 2U;
    if (rect.payloadLength > remainingPayload || rect.width > 240)
    {
      return false;
    }
    if (rect.encoding == kEncodingRaw)
    {
      if (rect.payloadLength != expectedPayload ||
          !consumeRawRect(stream, rect, crc, diagnostics, rowBuffer, kMaxBatchRows))
      {
        return false;
      }
    }
    else if (rect.encoding == kEncodingRgb565Rle)
    {
      if (rect.payloadLength == 0 || rect.payloadLength % 3U != 0 ||
          !consumeRleRect(stream, rect, crc, diagnostics, rowBuffer, kMaxBatchRows))
      {
        return false;
      }
    }
    else
    {
      return false;
    }

    remainingPayload -= rect.payloadLength;
  }

  return remainingPayload == 0 && crc32Finish(crc) == header.crc32;
}

bool HttpFrameClient::consumeRawRect(WiFiClient &stream, const RectHeader &rect, uint32_t &crc,
                                     app::FrameDiagnostics &diagnostics, uint16_t *rowBuffer, uint16_t maxBatchRows)
{
  const std::size_t rowBytes = static_cast<std::size_t>(rect.width) * 2U;
  for (uint16_t row = 0; row < rect.height;)
  {
    const uint16_t rowsThisBatch = std::min<uint16_t>(maxBatchRows, rect.height - row);
    const std::size_t batchBytes = rowBytes * rowsThisBatch;
    uint8_t *rowData = reinterpret_cast<uint8_t *>(rowBuffer);
    if (!readExact(stream, rowData, batchBytes, diagnostics.readMs, diagnostics))
    {
      return false;
    }
    crc = crc32Update(crc, rowData, batchBytes);
    const uint32_t tftStartedMs = millis();
    sink_.drawRgb565Block(rect.x, rect.y + row, rect.width, rowsThisBatch, rowBuffer);
    diagnostics.tftMs += millis() - tftStartedMs;
    ++diagnostics.tftCalls;
    ESP.wdtFeed();
    optimistic_yield(1000);
    row += rowsThisBatch;
  }
  return true;
}

bool HttpFrameClient::consumeRleRect(WiFiClient &stream, const RectHeader &rect, uint32_t &crc,
                                     app::FrameDiagnostics &diagnostics, uint16_t *rowBuffer, uint16_t maxBatchRows)
{
  constexpr std::size_t kRleChunkSize = 192;
  uint8_t rleBytes[kRleChunkSize];
  uint32_t encodedRemaining = rect.payloadLength;
  std::size_t chunkOffset = 0;
  std::size_t chunkLength = 0;
  uint8_t activeRunRemaining = 0;
  uint16_t activePixel = 0;
  uint32_t decodedPixels = 0;
  const uint32_t expectedPixels = static_cast<uint32_t>(rect.width) * rect.height;
  uint16_t row = 0;

  while (decodedPixels < expectedPixels)
  {
    const uint16_t rowsThisBatch = std::min<uint16_t>(maxBatchRows, rect.height - row);
    const uint32_t batchPixels = static_cast<uint32_t>(rect.width) * rowsThisBatch;
    uint32_t pixelsInBatch = 0;
    while (pixelsInBatch < batchPixels)
    {
      if (activeRunRemaining == 0)
      {
        if (chunkOffset >= chunkLength)
        {
          if (encodedRemaining < 3U)
          {
            return false;
          }
          chunkLength = std::min<std::size_t>(sizeof(rleBytes), encodedRemaining);
          chunkLength -= chunkLength % 3U;
          if (chunkLength == 0 || !readExact(stream, rleBytes, chunkLength, diagnostics.readMs, diagnostics))
          {
            return false;
          }
          crc = crc32Update(crc, rleBytes, chunkLength);
          encodedRemaining -= static_cast<uint32_t>(chunkLength);
          chunkOffset = 0;
        }

        const uint8_t runLength = rleBytes[chunkOffset];
        if (runLength == 0)
        {
          return false;
        }
        activeRunRemaining = runLength;
        activePixel = static_cast<uint16_t>(rleBytes[chunkOffset + 1]) |
                      static_cast<uint16_t>(static_cast<uint16_t>(rleBytes[chunkOffset + 2]) << 8);
        chunkOffset += 3;
      }

      while (activeRunRemaining > 0 && pixelsInBatch < batchPixels)
      {
        rowBuffer[pixelsInBatch] = activePixel;
        --activeRunRemaining;
        ++pixelsInBatch;
        ++decodedPixels;
      }
    }

    const uint32_t tftStartedMs = millis();
    sink_.drawRgb565Block(rect.x, rect.y + row, rect.width, rowsThisBatch, rowBuffer);
    diagnostics.tftMs += millis() - tftStartedMs;
    ++diagnostics.tftCalls;
    ESP.wdtFeed();
    optimistic_yield(1000);
    row += rowsThisBatch;
  }

  return encodedRemaining == 0 && chunkOffset == chunkLength && activeRunRemaining == 0 &&
         decodedPixels == expectedPixels;
}

} // namespace remote
