#ifndef REMOTE_SERIAL_FRAME_LINK_H
#define REMOTE_SERIAL_FRAME_LINK_H

#include <Arduino.h>
#include <cstddef>
#include <cstdint>

#include "remote/DeviceCommand.h"
#include "remote/FrameStreamConsumer.h"
#include "remote/SerialProtocol.h"

namespace remote
{

struct SerialTickResult
{
  // 本次 tick 是否收到过任何合法信封（HELLO / 帧 / 命令），用于链路探活。
  bool sawValidEnvelope = false;
  bool frameDrawn = false;
  bool hostHelloSeen = false;
  bool commandReceived = false;
  DeviceCommand command;
};

// 串口链路的设备端：解析下行信封（帧/命令/HELLO），发送上行消息（HELLO/
// 输入/状态/帧 ACK/命令 ACK）。帧体经共享的 FrameStreamConsumer 流式绘制；
// 停等节奏由宿主机主导——它收到 frame_ack 才推下一帧，设备侧永远最多积压
// 一帧在途。
class SerialFrameLink
{
public:
  SerialFrameLink(HardwareSerial &serial, FrameStreamConsumer &consumer) : serial_(serial), consumer_(consumer)
  {
  }

  void begin(const char *deviceId);

  // 消费当前可用的下行字节。acceptContent=false 时只识别 HELLO（WiFi 模式下
  // 的被动探测）：帧/命令信封被完整读走丢弃、不绘制不应用不 ACK，避免双链路
  // 同时画屏。帧消费本身是阻塞式流读（与 HTTP 拉帧同量级）。
  SerialTickResult tick(uint32_t nowMs, bool acceptContent);

  void sendHello();
  void sendInput(uint32_t seq, const char *eventName, uint32_t uptimeMs);
  bool sendStatus(uint8_t brightness, uint32_t uptimeMs, uint32_t heapFree, uint32_t heapMaxBlock,
                  uint8_t heapFragmentation, int16_t wifiRssi);
  void sendCommandAck(uint32_t commandId);

  uint32_t haveFrameId() const
  {
    return haveFrameId_;
  }

  // 最近一次收到合法下行信封的时刻（毫秒）。首页每秒必有帧，长时间静默
  // 即链路断开。
  uint32_t lastDownlinkMs() const
  {
    return lastDownlinkMs_;
  }

private:
  void sendEnvelope(uint8_t type, const uint8_t *payload, std::size_t length);
  void sendFrameAck();
  bool handleFrame(const SerialEnvelopeHeader &envelope, SerialTickResult &result, bool acceptContent);
  bool handleControl(const SerialEnvelopeHeader &envelope, SerialTickResult &result, bool acceptContent);
  bool discardPayload(ByteSource &source, uint32_t length);

  HardwareSerial &serial_;
  FrameStreamConsumer &consumer_;
  SerialEnvelopeScanner scanner_;
  // gcc 4.8（xtensa 工具链）不支持 char 数组 NSDMI 用字符串字面量，用 {}。
  char deviceId_[33] = {};
  uint32_t haveFrameId_ = 0;
  uint32_t lastDownlinkMs_ = 0;
  // HELLO 速率限制：宿主机对设备 HELLO 会立即回 HELLO，无限制互回会乒乓。
  bool helloEverSent_ = false;
  uint32_t lastHelloSentMs_ = 0;
  // 控制消息接收缓冲：放成员（BSS）而非 handleControl 栈上，ESP8266 栈紧张。
  uint8_t controlPayload_[kSerialMaxControlPayload + 1] = {};
};

} // namespace remote

#endif // REMOTE_SERIAL_FRAME_LINK_H
