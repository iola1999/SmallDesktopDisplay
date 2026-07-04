#ifndef REMOTE_HTTP_FRAME_CLIENT_H
#define REMOTE_HTTP_FRAME_CLIENT_H

#include "remote/FrameProtocol.h"
#include "remote/FrameStreamConsumer.h"

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

// WiFi 链路的帧拉取：HTTP keep-alive 长轮询 + 帧头解析，帧体解码/绘制
// 委托给与串口链路共用的 FrameStreamConsumer。
class HttpFrameClient
{
public:
  explicit HttpFrameClient(FrameStreamConsumer &consumer) : consumer_(consumer)
  {
  }
  ~HttpFrameClient();

  FrameFetchResult fetchLatest(const String &baseUrl, const String &deviceId, uint32_t haveFrameId, uint32_t waitMs,
                               uint32_t &outFrameId);

  // 最近一次帧轮询（200/204）响应头 X-SDD-Cmd 携带的服务端最新命令 id；
  // 0 表示服务端还没有任何命令。命令通道据此决定是否真正发起 GET。
  uint32_t latestServerCommandId() const
  {
    return latestServerCommandId_;
  }

private:
  void resetConnection();

  FrameStreamConsumer &consumer_;
  WiFiClient client_;
  HTTPClient http_;
  app::RemoteKeepAlivePolicy keepAlivePolicy_;
  uint32_t latestServerCommandId_ = 0;
};

} // namespace remote

#endif // REMOTE_HTTP_FRAME_CLIENT_H
