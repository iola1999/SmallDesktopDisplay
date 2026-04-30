#ifndef REMOTE_HTTP_FRAME_CLIENT_H
#define REMOTE_HTTP_FRAME_CLIENT_H

#include "remote/FrameProtocol.h"
#include "ui/TftFrameSink.h"

#include <Arduino.h>
#include <WiFiClient.h>
#include <cstdint>

#include "app/FrameDiagnostics.h"

namespace remote
{

enum class FrameFetchResult
{
  Updated,
  NotModified,
  Failed,
};

class HttpFrameClient
{
public:
  explicit HttpFrameClient(ui::TftFrameSink &sink) : sink_(sink)
  {
  }

  FrameFetchResult fetchLatest(const String &baseUrl, const String &deviceId, uint32_t haveFrameId, uint32_t waitMs,
                               uint32_t &outFrameId);

private:
  bool readExact(WiFiClient &stream, uint8_t *buffer, std::size_t length);
  bool readExact(WiFiClient &stream, uint8_t *buffer, std::size_t length, uint32_t &elapsedMs);
  bool readExact(WiFiClient &stream, uint8_t *buffer, std::size_t length, uint32_t &elapsedMs,
                 app::FrameDiagnostics &diagnostics);
  bool consumeFrame(WiFiClient &stream, const FrameHeader &header, app::FrameDiagnostics &diagnostics);
  bool consumeRawRect(WiFiClient &stream, const RectHeader &rect, uint32_t &crc, app::FrameDiagnostics &diagnostics,
                      uint16_t *rowBuffer, uint16_t maxBatchRows);
  bool consumeRleRect(WiFiClient &stream, const RectHeader &rect, uint32_t &crc, app::FrameDiagnostics &diagnostics,
                      uint16_t *rowBuffer, uint16_t maxBatchRows);

  ui::TftFrameSink &sink_;
};

} // namespace remote

#endif // REMOTE_HTTP_FRAME_CLIENT_H
