#ifndef REMOTE_HTTP_FRAME_CLIENT_H
#define REMOTE_HTTP_FRAME_CLIENT_H

#include "remote/FrameProtocol.h"
#include "ui/TftFrameSink.h"

#include <Arduino.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClient.h>
#include <cstdint>

#include "app/FrameDiagnostics.h"
#include "app/RemoteKeepAlivePolicy.h"

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
  ~HttpFrameClient();

  FrameFetchResult fetchLatest(const String &baseUrl, const String &deviceId, uint32_t haveFrameId, uint32_t waitMs,
                               uint32_t &outFrameId);

private:
  void resetConnection();

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
  WiFiClient client_;
  HTTPClient http_;
  app::RemoteKeepAlivePolicy keepAlivePolicy_;
  // 解码/绘制共用的行块缓冲（240px × 2 行 RGB565 = 960B）。
  // 放成员而不是 consumeFrame 的栈上：ESP8266 任务栈只有 ~4KB，HTTP 栈帧之上再压
  // 近 1KB 缓冲曾是审计里的栈压力项；对象本身是全局静态，成员落在 BSS 不占堆。
  static constexpr uint16_t kMaxBatchRows = 2;
  uint16_t rowBuffer_[240 * kMaxBatchRows] = {};
};

} // namespace remote

#endif // REMOTE_HTTP_FRAME_CLIENT_H
