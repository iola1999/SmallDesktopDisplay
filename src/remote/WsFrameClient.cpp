#include "remote/WsFrameClient.h"

#include <algorithm>
#include <cstring>

#include <ESP8266WiFi.h>

#include "AppConfig.h"

namespace remote
{

namespace
{

bool sameEndpoint(const app::RemoteWebSocketEndpoint &lhs, const app::RemoteWebSocketEndpoint &rhs)
{
  return lhs.host == rhs.host && lhs.port == rhs.port && lhs.path == rhs.path;
}

bool rectFitsFrame(const FrameHeader &frame, const RectHeader &rect)
{
  return rect.x + rect.width <= frame.width && rect.y + rect.height <= frame.height;
}

uint32_t extractJsonUInt(const uint8_t *payload, std::size_t length, const char *key)
{
  const std::size_t keyLength = std::strlen(key);
  for (std::size_t index = 0; index + keyLength + 3 < length; ++index)
  {
    if (payload[index] != '"' || std::memcmp(payload + index + 1, key, keyLength) != 0 ||
        payload[index + 1 + keyLength] != '"' || payload[index + 2 + keyLength] != ':')
    {
      continue;
    }

    std::size_t cursor = index + keyLength + 3;
    while (cursor < length && payload[cursor] == ' ')
    {
      ++cursor;
    }

    uint32_t value = 0;
    while (cursor < length && payload[cursor] >= '0' && payload[cursor] <= '9')
    {
      value = value * 10U + static_cast<uint32_t>(payload[cursor] - '0');
      ++cursor;
    }
    return value;
  }
  return 0;
}

bool containsText(const uint8_t *payload, std::size_t length, const char *text)
{
  const std::size_t textLength = std::strlen(text);
  if (textLength == 0 || length < textLength)
  {
    return false;
  }
  for (std::size_t index = 0; index + textLength <= length; ++index)
  {
    if (std::memcmp(payload + index, text, textLength) == 0)
    {
      return true;
    }
  }
  return false;
}

} // namespace

WsFrameClient::WsFrameClient(ui::TftFrameSink &sink) : sink_(sink)
{
  websocket_.onEvent([this](WStype_t type, uint8_t *payload, std::size_t length)
                     { handleEvent(type, payload, length); });
  websocket_.setReconnectInterval(1000);
}

WsFrameClient::~WsFrameClient()
{
  disconnect();
}

FrameFetchResult WsFrameClient::poll(const String &baseUrl, const String &deviceId, uint32_t haveFrameId,
                                     uint32_t waitMs, uint32_t &outFrameId)
{
  app::RemoteWebSocketEndpoint endpoint;
  if (!app::parseRemoteWebSocketEndpoint(baseUrl.c_str(), deviceId.c_str(), haveFrameId, waitMs, endpoint))
  {
    disconnect();
    return FrameFetchResult::Failed;
  }
  app::RemoteWebSocketEndpoint endpointKey;
  if (!app::parseRemoteWebSocketEndpoint(baseUrl.c_str(), deviceId.c_str(), 0, waitMs, endpointKey))
  {
    disconnect();
    return FrameFetchResult::Failed;
  }

  expectedHaveFrameId_ = haveFrameId;
  if (!endpointActive_ || !sameEndpoint(activeEndpoint_, endpointKey))
  {
    connect(endpoint, endpointKey);
  }

  websocket_.loop();
  if (connected_ && !awaitingResponse_ && !frameReady_)
  {
    sendFrameRequest(haveFrameId);
  }

  if (frameReady_)
  {
    frameReady_ = false;
    outFrameId = latestFrameId_;
    return FrameFetchResult::Updated;
  }

  if (!connected_ && millis() - lastConnectStartedMs_ > 3000U)
  {
    return FrameFetchResult::Failed;
  }
  return FrameFetchResult::NotModified;
}

void WsFrameClient::connect(const app::RemoteWebSocketEndpoint &endpoint,
                            const app::RemoteWebSocketEndpoint &endpointKey)
{
  disconnect();
  activeEndpoint_ = endpointKey;
  endpointActive_ = true;
  lastConnectStartedMs_ = millis();
  websocket_.begin(endpoint.host.c_str(), endpoint.port, endpoint.path.c_str());
}

void WsFrameClient::disconnect()
{
  websocket_.disconnect();
  endpointActive_ = false;
  connected_ = false;
  awaitingResponse_ = false;
  frameReady_ = false;
}

void WsFrameClient::handleEvent(WStype_t type, uint8_t *payload, std::size_t length)
{
  switch (type)
  {
  case WStype_CONNECTED:
    connected_ = true;
    awaitingResponse_ = false;
    Serial.println(F("[RemoteWsFrame] connected"));
    break;

  case WStype_DISCONNECTED:
    connected_ = false;
    awaitingResponse_ = false;
    Serial.printf("[RemoteWsFrame] disconnected heap=%lu max_block=%lu frag=%u%%\n",
                  static_cast<unsigned long>(ESP.getFreeHeap()), static_cast<unsigned long>(ESP.getMaxFreeBlockSize()),
                  ESP.getHeapFragmentation());
    break;

  case WStype_TEXT:
    handleText(payload, length);
    break;

  case WStype_BIN:
    if (!handleBinary(payload, length))
    {
      Serial.println(F("[RemoteWsFrame] invalid frame"));
      disconnect();
    }
    break;

  case WStype_ERROR:
    Serial.println(F("[RemoteWsFrame] error"));
    disconnect();
    break;

  default:
    break;
  }
}

void WsFrameClient::handleText(const uint8_t *payload, std::size_t length)
{
  pendingServerWaitMs_ = extractJsonUInt(payload, length, "wait_ms");
  pendingServerRenderMs_ = extractJsonUInt(payload, length, "render_ms");
  pendingServerTotalMs_ = extractJsonUInt(payload, length, "total_ms");
  if (containsText(payload, length, "not_modified"))
  {
    awaitingResponse_ = false;
    pendingChunkCount_ = 1;
    receivedChunkCount_ = 0;
    chunkFrameId_ = 0;
    return;
  }

  const uint32_t chunks = extractJsonUInt(payload, length, "chunks");
  pendingChunkCount_ = static_cast<uint16_t>(std::max<uint32_t>(1U, std::min<uint32_t>(chunks, 64U)));
  receivedChunkCount_ = 0;
  chunkFrameId_ = 0;
  if (pendingChunkCount_ > 1)
  {
    Serial.printf("[RemoteWsFrame] chunked frame chunks=%u bytes=%lu heap=%lu max_block=%lu\n", pendingChunkCount_,
                  static_cast<unsigned long>(extractJsonUInt(payload, length, "bytes")),
                  static_cast<unsigned long>(ESP.getFreeHeap()), static_cast<unsigned long>(ESP.getMaxFreeBlockSize()));
  }
}

bool WsFrameClient::handleBinary(uint8_t *payload, std::size_t length)
{
  const uint32_t startedMs = millis();
  if (payload == nullptr || length < kFrameHeaderSize)
  {
    return false;
  }

  FrameHeader header;
  if (!parseFrameHeader(payload, length, header))
  {
    return false;
  }
  const bool continuingChunk = pendingChunkCount_ > 1 && receivedChunkCount_ > 0 && header.frameId == chunkFrameId_;
  if (!header.fullFrame && !continuingChunk && header.baseFrameId != expectedHaveFrameId_)
  {
    Serial.printf("[RemoteWsFrame] stale partial base=%lu have=%lu frame=%lu\n",
                  static_cast<unsigned long>(header.baseFrameId), static_cast<unsigned long>(expectedHaveFrameId_),
                  static_cast<unsigned long>(header.frameId));
    return false;
  }

  app::FrameDiagnostics diagnostics;
  diagnostics.serverWaitMs = pendingServerWaitMs_;
  diagnostics.serverRenderMs = pendingServerRenderMs_;
  diagnostics.serverTotalMs = pendingServerTotalMs_;
  diagnostics.streamBytes = static_cast<uint32_t>(length);
  if (!consumeFrameBuffer(payload + kFrameHeaderSize, length - kFrameHeaderSize, header, diagnostics))
  {
    return false;
  }

  diagnostics.totalMs = millis() - startedMs;
  if (app::shouldLogFrameDiagnostics(header.fullFrame, header.payloadLength, header.rectCount))
  {
    Serial.printf("[RemoteWsFrame] frame=%lu %s rects=%u bytes=%lu srv_wait_ms=%lu srv_render_ms=%lu srv_total_ms=%lu "
                  "tft_ms=%lu tft_calls=%lu total_ms=%lu\n",
                  static_cast<unsigned long>(header.frameId), header.fullFrame ? "full" : "partial", header.rectCount,
                  static_cast<unsigned long>(length), static_cast<unsigned long>(diagnostics.serverWaitMs),
                  static_cast<unsigned long>(diagnostics.serverRenderMs),
                  static_cast<unsigned long>(diagnostics.serverTotalMs), static_cast<unsigned long>(diagnostics.tftMs),
                  static_cast<unsigned long>(diagnostics.tftCalls), static_cast<unsigned long>(diagnostics.totalMs));
  }

  ++receivedChunkCount_;
  if (receivedChunkCount_ == 1)
  {
    chunkFrameId_ = header.frameId;
  }
  if (receivedChunkCount_ >= pendingChunkCount_)
  {
    latestFrameId_ = header.frameId;
    frameReady_ = true;
    awaitingResponse_ = false;
    pendingChunkCount_ = 1;
    receivedChunkCount_ = 0;
    chunkFrameId_ = 0;
  }
  return true;
}

bool WsFrameClient::consumeFrameBuffer(const uint8_t *payload, std::size_t length, const FrameHeader &header,
                                       app::FrameDiagnostics &diagnostics)
{
  const uint8_t *cursor = payload;
  const uint8_t *end = payload + length;
  uint32_t crc = crc32Begin();
  uint32_t remainingPayload = header.payloadLength;

  for (uint16_t index = 0; index < header.rectCount; ++index)
  {
    if (end - cursor < static_cast<std::ptrdiff_t>(kRectHeaderSize))
    {
      return false;
    }

    RectHeader rect;
    if (!parseRectHeader(cursor, kRectHeaderSize, rect) || !rectFitsFrame(header, rect))
    {
      return false;
    }

    crc = crc32Update(crc, cursor, kRectHeaderSize);
    cursor += kRectHeaderSize;
    if (rect.payloadLength > remainingPayload || rect.payloadLength > static_cast<uint32_t>(end - cursor) ||
        rect.width > 240)
    {
      return false;
    }

    if (rect.encoding == kEncodingRaw)
    {
      const uint32_t expectedPayload = static_cast<uint32_t>(rect.width) * rect.height * 2U;
      if (rect.payloadLength != expectedPayload || !consumeRawRect(cursor, end, rect, crc, diagnostics))
      {
        return false;
      }
    }
    else if (rect.encoding == kEncodingRgb565Rle)
    {
      if (rect.payloadLength == 0 || rect.payloadLength % 3U != 0 ||
          !consumeRleRect(cursor, end, rect, crc, diagnostics))
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

  return remainingPayload == 0 && cursor == end && crc32Finish(crc) == header.crc32;
}

bool WsFrameClient::consumeRawRect(const uint8_t *&cursor, const uint8_t *end, const RectHeader &rect, uint32_t &crc,
                                   app::FrameDiagnostics &diagnostics)
{
  constexpr uint16_t kMaxBatchRows = 2;
  const std::size_t rowBytes = static_cast<std::size_t>(rect.width) * 2U;
  uint16_t rowBuffer[240 * kMaxBatchRows];
  for (uint16_t row = 0; row < rect.height;)
  {
    const uint16_t rowsThisBatch = std::min<uint16_t>(kMaxBatchRows, rect.height - row);
    const std::size_t batchBytes = rowBytes * rowsThisBatch;
    if (end - cursor < static_cast<std::ptrdiff_t>(batchBytes))
    {
      return false;
    }

    std::memcpy(rowBuffer, cursor, batchBytes);
    crc = crc32Update(crc, cursor, batchBytes);
    cursor += batchBytes;
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

bool WsFrameClient::consumeRleRect(const uint8_t *&cursor, const uint8_t *end, const RectHeader &rect, uint32_t &crc,
                                   app::FrameDiagnostics &diagnostics)
{
  constexpr uint16_t kMaxBatchRows = 2;
  uint16_t rowBuffer[240 * kMaxBatchRows];
  uint32_t encodedRemaining = rect.payloadLength;
  uint8_t activeRunRemaining = 0;
  uint16_t activePixel = 0;
  uint32_t decodedPixels = 0;
  const uint32_t expectedPixels = static_cast<uint32_t>(rect.width) * rect.height;
  uint16_t row = 0;

  while (decodedPixels < expectedPixels)
  {
    const uint16_t rowsThisBatch = std::min<uint16_t>(kMaxBatchRows, rect.height - row);
    const uint32_t batchPixels = static_cast<uint32_t>(rect.width) * rowsThisBatch;
    uint32_t pixelsInBatch = 0;
    while (pixelsInBatch < batchPixels)
    {
      if (activeRunRemaining == 0)
      {
        if (encodedRemaining < 3U || end - cursor < 3)
        {
          return false;
        }
        const uint8_t runLength = cursor[0];
        if (runLength == 0)
        {
          return false;
        }
        activeRunRemaining = runLength;
        activePixel = static_cast<uint16_t>(cursor[1]) | static_cast<uint16_t>(static_cast<uint16_t>(cursor[2]) << 8);
        crc = crc32Update(crc, cursor, 3);
        cursor += 3;
        encodedRemaining -= 3U;
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

  return encodedRemaining == 0 && activeRunRemaining == 0 && decodedPixels == expectedPixels;
}

void WsFrameClient::sendFrameRequest(uint32_t haveFrameId)
{
  String request = String("{\"have\":") + String(haveFrameId) + "}";
  awaitingResponse_ = websocket_.sendTXT(request);
}

} // namespace remote
