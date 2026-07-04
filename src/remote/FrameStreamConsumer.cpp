#include "remote/FrameStreamConsumer.h"

#include <Arduino.h>
#include <algorithm>

namespace remote
{

namespace
{

bool rectFitsFrame(const FrameHeader &frame, const RectHeader &rect)
{
  return rect.x + rect.width <= frame.width && rect.y + rect.height <= frame.height;
}

} // namespace

bool FrameStreamConsumer::readExact(ByteSource &source, uint8_t *buffer, std::size_t length, uint32_t &elapsedMs,
                                    app::FrameDiagnostics &diagnostics, uint32_t timeoutMs)
{
  std::size_t offset = 0;
  const uint32_t startedMs = millis();
  uint32_t lastProgressMs = startedMs;
  ++diagnostics.streamReads;
  diagnostics.streamBytes += static_cast<uint32_t>(length);
  while (offset < length)
  {
    const int available = source.available();
    if (available <= 0)
    {
      if (millis() - lastProgressMs >= timeoutMs)
      {
        elapsedMs += millis() - startedMs;
        return false;
      }
      ESP.wdtFeed();
      optimistic_yield(1000);
      continue;
    }

    const std::size_t requested = std::min<std::size_t>(length - offset, static_cast<std::size_t>(available));
    const int count = source.read(buffer + offset, requested);
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

bool FrameStreamConsumer::consumeBody(ByteSource &source, const FrameHeader &header,
                                      app::FrameDiagnostics &diagnostics, uint32_t timeoutMs)
{
  uint32_t crc = crc32Begin();
  uint32_t remainingPayload = header.payloadLength;

  for (uint16_t index = 0; index < header.rectCount; ++index)
  {
    uint8_t rectBytes[kRectHeaderSize];
    RectHeader rect;
    if (!readExact(source, rectBytes, sizeof(rectBytes), diagnostics.readMs, diagnostics, timeoutMs) ||
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
      if (rect.payloadLength != expectedPayload || !consumeRawRect(source, rect, crc, diagnostics, timeoutMs))
      {
        return false;
      }
    }
    else if (rect.encoding == kEncodingRgb565Rle)
    {
      if (rect.payloadLength == 0 || rect.payloadLength % 3U != 0 ||
          !consumeRleRect(source, rect, crc, diagnostics, timeoutMs))
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

bool FrameStreamConsumer::consumeRawRect(ByteSource &source, const RectHeader &rect, uint32_t &crc,
                                         app::FrameDiagnostics &diagnostics, uint32_t timeoutMs)
{
  const std::size_t rowBytes = static_cast<std::size_t>(rect.width) * 2U;
  for (uint16_t row = 0; row < rect.height;)
  {
    const uint16_t rowsThisBatch = computeBatchRows(rect.width, rect.height - row);
    const std::size_t batchBytes = rowBytes * rowsThisBatch;
    uint8_t *rowData = reinterpret_cast<uint8_t *>(rowBuffer_);
    if (!readExact(source, rowData, batchBytes, diagnostics.readMs, diagnostics, timeoutMs))
    {
      return false;
    }
    crc = crc32Update(crc, rowData, batchBytes);
    const uint32_t tftStartedMs = millis();
    sink_.drawRgb565Block(rect.x, rect.y + row, rect.width, rowsThisBatch, rowBuffer_);
    diagnostics.tftMs += millis() - tftStartedMs;
    ++diagnostics.tftCalls;
    ESP.wdtFeed();
    optimistic_yield(1000);
    row += rowsThisBatch;
  }
  return true;
}

bool FrameStreamConsumer::consumeRleRect(ByteSource &source, const RectHeader &rect, uint32_t &crc,
                                         app::FrameDiagnostics &diagnostics, uint32_t timeoutMs)
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
    const uint16_t rowsThisBatch = computeBatchRows(rect.width, rect.height - row);
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
          if (chunkLength == 0 ||
              !readExact(source, rleBytes, chunkLength, diagnostics.readMs, diagnostics, timeoutMs))
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
        rowBuffer_[pixelsInBatch] = activePixel;
        --activeRunRemaining;
        ++pixelsInBatch;
        ++decodedPixels;
      }
    }

    const uint32_t tftStartedMs = millis();
    sink_.drawRgb565Block(rect.x, rect.y + row, rect.width, rowsThisBatch, rowBuffer_);
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
