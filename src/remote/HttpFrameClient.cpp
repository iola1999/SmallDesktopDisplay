#include "remote/HttpFrameClient.h"

#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>

#include "AppConfig.h"
#include "app/FrameDiagnostics.h"
#include "remote/ByteSource.h"

namespace remote
{

namespace
{

uint32_t parseHeaderU32(const String &value)
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
  // strtoul 溢出时已返回 ULONG_MAX，在 ESP8266 上即 UINT32_MAX。
  return static_cast<uint32_t>(parsed);
}

// WiFiClient 到 ByteSource 的适配：帧体读取走共用消费器。
class WiFiClientByteSource : public ByteSource
{
public:
  explicit WiFiClientByteSource(WiFiClient &client) : client_(client)
  {
  }

  int available() override
  {
    return client_.available();
  }

  int read(uint8_t *buffer, std::size_t length) override
  {
    return client_.read(buffer, length);
  }

private:
  WiFiClient &client_;
};

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
  // 去掉 baseUrl 末尾多余的 '/' 后用定长缓冲拼出请求 URL，避免每次轮询（最快 20Hz）
  // 都产生多个 Arduino String 临时对象，缓解 ~40-50KB 堆的碎片化。
  char baseTrimmed[100];
  snprintf(baseTrimmed, sizeof(baseTrimmed), "%s", baseUrl.c_str());
  size_t baseLen = strlen(baseTrimmed);
  while (baseLen > 0 && baseTrimmed[baseLen - 1] == '/')
  {
    baseTrimmed[--baseLen] = '\0';
  }
  char url[200];
  snprintf(url, sizeof(url), "%s/api/v1/devices/%s/frame?have=%lu&wait_ms=%lu", baseTrimmed, deviceId.c_str(),
           static_cast<unsigned long>(haveFrameId), static_cast<unsigned long>(waitMs));
  const uint32_t beginStartedMs = millis();
  if (!http_.begin(client_, url))
  {
    resetConnection();
    return FrameFetchResult::Failed;
  }
  diagnostics.beginMs = millis() - beginStartedMs;

  static const char *kCollectedHeaders[] = {
      "X-SDD-Server-Wait-Ms",
      "X-SDD-Server-Render-Ms",
      "X-SDD-Server-Total-Ms",
      "X-SDD-Cmd",
  };
  http_.collectHeaders(kCollectedHeaders, 4);

  const uint32_t getStartedMs = millis();
  const int statusCode = http_.GET();
  diagnostics.getMs = millis() - getStartedMs;
  // 计时响应头只在确实要打印诊断时才读取/解析，避免每次轮询多产生 3 个
  // Arduino String 返回值；详见下方 shouldLogFrameDiagnostics 块。
  // X-SDD-Cmd（服务端最新命令 id）例外：它是命令通道的驱动信号，200/204 都要读，
  // 有了它 pollCommand 才能从每 100ms 盲轮询降为"有新命令才拉取"。
  if (statusCode == HTTP_CODE_NO_CONTENT || statusCode == HTTP_CODE_OK)
  {
    latestServerCommandId_ = parseHeaderU32(http_.header("X-SDD-Cmd"));
  }
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
  WiFiClientByteSource source(stream);

  uint8_t headerBytes[kFrameHeaderSize];
  FrameHeader header;
  // 帧头读取不计入 streamReads/streamBytes（诊断口径保持"仅帧体"），用独立
  // 诊断对象吞掉计数。
  app::FrameDiagnostics headerDiagnostics;
  if (!consumer_.readExact(source, headerBytes, sizeof(headerBytes), diagnostics.headerMs, headerDiagnostics,
                           app_config::kRemoteHttpTimeoutMs) ||
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

  if (!consumer_.consumeBody(source, header, diagnostics, app_config::kRemoteHttpTimeoutMs))
  {
    Serial.println(F("[RemoteFrame] invalid frame body"));
    resetConnection();
    return FrameFetchResult::Failed;
  }
  diagnostics.totalMs = millis() - requestStartedMs;
  if (app::shouldLogFrameDiagnostics(header.fullFrame, header.payloadLength, header.rectCount))
  {
    diagnostics.serverWaitMs = parseHeaderU32(http_.header("X-SDD-Server-Wait-Ms"));
    diagnostics.serverRenderMs = parseHeaderU32(http_.header("X-SDD-Server-Render-Ms"));
    diagnostics.serverTotalMs = parseHeaderU32(http_.header("X-SDD-Server-Total-Ms"));
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

} // namespace remote
