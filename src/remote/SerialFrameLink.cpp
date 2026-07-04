#include "remote/SerialFrameLink.h"

#include <algorithm>
#include <cstdio>
#include <cstring>

#include "AppConfig.h"
#include "app/FrameDiagnostics.h"
#include "remote/ByteSource.h"
#include "remote/DeviceStatusPayload.h"

namespace remote
{

namespace
{

// HardwareSerial → ByteSource 适配。readBytes 只取已就绪的字节，不额外等待
//（Stream 超时不会触发，因为请求量 ≤ available）。
class SerialByteSource : public ByteSource
{
public:
  explicit SerialByteSource(HardwareSerial &serial) : serial_(serial)
  {
  }

  int available() override
  {
    return serial_.available();
  }

  int read(uint8_t *buffer, std::size_t length) override
  {
    const int ready = serial_.available();
    if (ready <= 0)
    {
      return 0;
    }
    const std::size_t take = std::min(length, static_cast<std::size_t>(ready));
    return static_cast<int>(serial_.readBytes(reinterpret_cast<char *>(buffer), take));
  }

private:
  HardwareSerial &serial_;
};

} // namespace

void SerialFrameLink::begin(const char *deviceId)
{
  snprintf(deviceId_, sizeof(deviceId_), "%s", deviceId == nullptr ? "" : deviceId);
}

SerialTickResult SerialFrameLink::tick(uint32_t nowMs, bool acceptContent)
{
  (void)nowMs;
  SerialTickResult result;
  // 逐字节扫描直到定位一条信封；每次 tick 最多处理一条完整消息，剩余字节
  // 留给下一轮（停等协议下积压有限，RX 缓冲 4KB 兜底）。
  while (serial_.available() > 0)
  {
    const int byte = serial_.read();
    if (byte < 0)
    {
      break;
    }
    if (!scanner_.feed(static_cast<uint8_t>(byte)))
    {
      continue;
    }

    const SerialEnvelopeHeader envelope = scanner_.header();
    scanner_.reset();
    const bool handled = envelope.type == kSerialMsgFrame ? handleFrame(envelope, result, acceptContent)
                                                          : handleControl(envelope, result, acceptContent);
    if (handled)
    {
      result.sawValidEnvelope = true;
      lastDownlinkMs_ = millis();
    }
    break;
  }
  return result;
}

bool SerialFrameLink::handleFrame(const SerialEnvelopeHeader &envelope, SerialTickResult &result, bool acceptContent)
{
  SerialByteSource rawSource(serial_);
  Crc32ByteSource source(rawSource);
  app::FrameDiagnostics diagnostics;
  const uint32_t startedMs = millis();

  uint8_t headerBytes[kFrameHeaderSize];
  FrameHeader header;
  app::FrameDiagnostics headerDiagnostics;
  if (envelope.length < kFrameHeaderSize ||
      !consumer_.readExact(source, headerBytes, sizeof(headerBytes), diagnostics.headerMs, headerDiagnostics,
                           app_config::kSerialReadTimeoutMs) ||
      !parseFrameHeader(headerBytes, sizeof(headerBytes), header))
  {
    Serial.println(F("[SerialFrame] invalid frame header"));
    return false;
  }

  // 信封长度必须与 SDD1 自述的几何一致，读帧体前就能拒绝掉损坏的头。
  const uint32_t expectedLength =
      kFrameHeaderSize + static_cast<uint32_t>(header.rectCount) * kRectHeaderSize + header.payloadLength;
  if (envelope.length != expectedLength)
  {
    Serial.printf("[SerialFrame] envelope/frame length mismatch env=%lu frame=%lu\n",
                  static_cast<unsigned long>(envelope.length), static_cast<unsigned long>(expectedLength));
    return false;
  }

  if (!acceptContent)
  {
    // WiFi 模式的被动探测：完整读走但不绘制不 ACK。
    return discardPayload(source, envelope.length - kFrameHeaderSize);
  }

  if (!header.fullFrame && header.baseFrameId != haveFrameId_)
  {
    // 停等协议下正常不会出现；宿主机重启等极端情况的兜底：丢弃帧体并回报
    // 当前 have，让宿主机用 catch-up/全屏帧重同步。
    Serial.printf("[SerialFrame] stale partial base=%lu have=%lu frame=%lu\n",
                  static_cast<unsigned long>(header.baseFrameId), static_cast<unsigned long>(haveFrameId_),
                  static_cast<unsigned long>(header.frameId));
    const bool drained = discardPayload(source, envelope.length - kFrameHeaderSize);
    sendFrameAck();
    return drained;
  }

  if (!consumer_.consumeBody(source, header, diagnostics, app_config::kSerialReadTimeoutMs) ||
      source.consumedBytes() != envelope.length || source.finishCrc() != envelope.crc32)
  {
    // 屏幕可能已被部分绘制；保持 have 不变并回报，宿主机会推差分/全屏纠正。
    Serial.println(F("[SerialFrame] invalid frame body"));
    sendFrameAck();
    return false;
  }

  diagnostics.totalMs = millis() - startedMs;
  if (app::shouldLogFrameDiagnostics(header.fullFrame, header.payloadLength, header.rectCount))
  {
    Serial.printf("[SerialFrame] frame=%lu %s rects=%u payload=%lu read_ms=%lu stream_reads=%lu stream_bytes=%lu "
                  "tft_ms=%lu tft_calls=%lu total_ms=%lu\n",
                  static_cast<unsigned long>(header.frameId), header.fullFrame ? "full" : "partial", header.rectCount,
                  static_cast<unsigned long>(header.payloadLength), static_cast<unsigned long>(diagnostics.readMs),
                  static_cast<unsigned long>(diagnostics.streamReads),
                  static_cast<unsigned long>(diagnostics.streamBytes), static_cast<unsigned long>(diagnostics.tftMs),
                  static_cast<unsigned long>(diagnostics.tftCalls), static_cast<unsigned long>(diagnostics.totalMs));
  }

  haveFrameId_ = header.frameId;
  sendFrameAck();
  result.frameDrawn = true;
  return true;
}

bool SerialFrameLink::handleControl(const SerialEnvelopeHeader &envelope, SerialTickResult &result, bool acceptContent)
{
  // 控制消息都是小 JSON（≤512B），读进成员缓冲统一校验 CRC 后分发。
  // 缓冲放成员而非栈上：ESP8266 任务栈只有 ~4KB（同 rowBuffer_ 的教训）。
  uint8_t *payload = controlPayload_;
  if (envelope.length > kSerialMaxControlPayload)
  {
    return false;
  }
  SerialByteSource source(serial_);
  app::FrameDiagnostics unusedDiagnostics;
  uint32_t unusedElapsedMs = 0;
  if (envelope.length > 0 && !consumer_.readExact(source, payload, envelope.length, unusedElapsedMs,
                                                  unusedDiagnostics, app_config::kSerialReadTimeoutMs))
  {
    return false;
  }
  payload[envelope.length] = '\0';

  uint32_t crc = crc32Begin();
  crc = crc32Update(crc, payload, envelope.length);
  if (crc32Finish(crc) != envelope.crc32)
  {
    Serial.println(F("[SerialLink] control message crc mismatch"));
    return false;
  }

  switch (envelope.type)
  {
  case kSerialMsgHello:
    result.hostHelloSeen = true;
    return true;

  case kSerialMsgCommand:
    if (!acceptContent)
    {
      return true;
    }
    if (!parseDeviceCommand(reinterpret_cast<const char *>(payload), result.command))
    {
      Serial.println(F("[SerialLink] invalid command payload"));
      return false;
    }
    result.commandReceived = true;
    return true;

  default:
    // 上行类型不应出现在下行；当作合法信封计入探活但不处理。
    return true;
  }
}

bool SerialFrameLink::discardPayload(ByteSource &source, uint32_t length)
{
  uint8_t scratch[128];
  app::FrameDiagnostics unusedDiagnostics;
  uint32_t unusedElapsedMs = 0;
  uint32_t remaining = length;
  while (remaining > 0)
  {
    const uint32_t take = std::min<uint32_t>(remaining, sizeof(scratch));
    if (!consumer_.readExact(source, scratch, take, unusedElapsedMs, unusedDiagnostics,
                             app_config::kSerialReadTimeoutMs))
    {
      return false;
    }
    remaining -= take;
  }
  return true;
}

void SerialFrameLink::sendEnvelope(uint8_t type, const uint8_t *payload, std::size_t length)
{
  uint32_t crc = crc32Begin();
  if (length > 0)
  {
    crc = crc32Update(crc, payload, length);
  }
  uint8_t header[kSerialEnvelopeHeaderSize];
  encodeSerialEnvelopeHeader(type, static_cast<uint32_t>(length), crc32Finish(crc), header);
  serial_.write(header, sizeof(header));
  if (length > 0)
  {
    serial_.write(payload, length);
  }
}

void SerialFrameLink::sendHello()
{
  // 速率限制：宿主机对设备 HELLO 会立即回 HELLO（加速开机探测），设备再
  // 无条件回应就会互相乒乓且反复把 have 归零。1.5s 间隔小于宿主机 2s 探测
  // 周期，不影响正常探活。
  const uint32_t nowMs = millis();
  if (helloEverSent_ && nowMs - lastHelloSentMs_ < app_config::kSerialHelloMinIntervalMs)
  {
    return;
  }
  char body[96];
  const int written = snprintf(body, sizeof(body), "{\"device_id\":\"%s\",\"proto\":1}", deviceId_);
  if (written <= 0 || static_cast<std::size_t>(written) >= sizeof(body))
  {
    return;
  }
  helloEverSent_ = true;
  lastHelloSentMs_ = nowMs;
  sendEnvelope(kSerialMsgDeviceHello, reinterpret_cast<const uint8_t *>(body), static_cast<std::size_t>(written));
}

void SerialFrameLink::sendInput(uint32_t seq, const char *eventName, uint32_t uptimeMs)
{
  char body[96];
  const int written = snprintf(body, sizeof(body), "{\"seq\":%lu,\"event\":\"%s\",\"uptime_ms\":%lu}",
                               static_cast<unsigned long>(seq), eventName, static_cast<unsigned long>(uptimeMs));
  if (written <= 0 || static_cast<std::size_t>(written) >= sizeof(body))
  {
    return;
  }
  sendEnvelope(kSerialMsgInput, reinterpret_cast<const uint8_t *>(body), static_cast<std::size_t>(written));
}

bool SerialFrameLink::sendStatus(uint8_t brightness, uint32_t uptimeMs, uint32_t heapFree, uint32_t heapMaxBlock,
                                 uint8_t heapFragmentation, int16_t wifiRssi)
{
  char body[160];
  if (!buildDeviceStatusPayload(brightness, uptimeMs, heapFree, heapMaxBlock, heapFragmentation, wifiRssi, body,
                                sizeof(body)))
  {
    return false;
  }
  sendEnvelope(kSerialMsgStatus, reinterpret_cast<const uint8_t *>(body), strlen(body));
  return true;
}

void SerialFrameLink::sendCommandAck(uint32_t commandId)
{
  char body[48];
  const int written = snprintf(body, sizeof(body), "{\"id\":%lu}", static_cast<unsigned long>(commandId));
  if (written <= 0 || static_cast<std::size_t>(written) >= sizeof(body))
  {
    return;
  }
  sendEnvelope(kSerialMsgCommandAck, reinterpret_cast<const uint8_t *>(body), static_cast<std::size_t>(written));
}

void SerialFrameLink::sendFrameAck()
{
  char body[48];
  const int written = snprintf(body, sizeof(body), "{\"frame_id\":%lu}", static_cast<unsigned long>(haveFrameId_));
  if (written <= 0 || static_cast<std::size_t>(written) >= sizeof(body))
  {
    return;
  }
  sendEnvelope(kSerialMsgFrameAck, reinterpret_cast<const uint8_t *>(body), static_cast<std::size_t>(written));
}

} // namespace remote
