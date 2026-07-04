#ifndef REMOTE_SERIAL_PROTOCOL_H
#define REMOTE_SERIAL_PROTOCOL_H

#include <cstddef>
#include <cstdint>

#include "remote/FrameProtocol.h"

namespace remote
{

// 串口链路的消息信封：设备经 USB-serial 直连渲染服务宿主机时，帧/命令/输入/
// 状态复用同一根线（UART0 全双工）。信封之间允许出现裸日志文本——固件里的
// Serial.printf 原样保留，宿主机把非信封字节按日志行透传到容器日志；接收方靠
// 双字节 magic + 头部合法性 + CRC 重同步。
//
//   magic0   u8     0xA5
//   magic1   u8     0x5A
//   type     u8
//   length   u32le  payload 字节数
//   crc32    u32le  payload 的 CRC32（zlib 多项式，与 SDD1 内层一致）
//   payload  length 字节
//
// FRAME 的 payload 是完整 SDD1 帧（原样字节，自带内层 CRC）；其余消息的
// payload 均为一行小 JSON，格式与既有 HTTP API 的请求/响应体一致。

constexpr uint8_t kSerialMagic0 = 0xA5;
constexpr uint8_t kSerialMagic1 = 0x5A;
constexpr std::size_t kSerialEnvelopeHeaderSize = 11;

// 下行（宿主机 → 设备）
constexpr uint8_t kSerialMsgFrame = 0x01;
constexpr uint8_t kSerialMsgCommand = 0x02;
constexpr uint8_t kSerialMsgHello = 0x03;
// 上行（设备 → 宿主机）
constexpr uint8_t kSerialMsgDeviceHello = 0x81;
constexpr uint8_t kSerialMsgInput = 0x82;
constexpr uint8_t kSerialMsgStatus = 0x83;
constexpr uint8_t kSerialMsgFrameAck = 0x84;
constexpr uint8_t kSerialMsgCommandAck = 0x85;

// 帧上限 = 240×240 raw 全屏（115200B）+ rect/帧头富余；控制类消息都是小 JSON。
constexpr uint32_t kSerialMaxFramePayload = 131072;
constexpr uint32_t kSerialMaxControlPayload = 512;

struct SerialEnvelopeHeader
{
  uint8_t type = 0;
  uint32_t length = 0;
  uint32_t crc32 = 0;
};

inline bool isKnownSerialType(uint8_t type)
{
  switch (type)
  {
  case kSerialMsgFrame:
  case kSerialMsgCommand:
  case kSerialMsgHello:
  case kSerialMsgDeviceHello:
  case kSerialMsgInput:
  case kSerialMsgStatus:
  case kSerialMsgFrameAck:
  case kSerialMsgCommandAck:
    return true;
  default:
    return false;
  }
}

inline uint32_t serialMaxPayload(uint8_t type)
{
  return type == kSerialMsgFrame ? kSerialMaxFramePayload : kSerialMaxControlPayload;
}

inline void encodeSerialEnvelopeHeader(uint8_t type, uint32_t length, uint32_t payloadCrc32,
                                       uint8_t out[kSerialEnvelopeHeaderSize])
{
  out[0] = kSerialMagic0;
  out[1] = kSerialMagic1;
  out[2] = type;
  out[3] = static_cast<uint8_t>(length & 0xFFU);
  out[4] = static_cast<uint8_t>((length >> 8) & 0xFFU);
  out[5] = static_cast<uint8_t>((length >> 16) & 0xFFU);
  out[6] = static_cast<uint8_t>((length >> 24) & 0xFFU);
  out[7] = static_cast<uint8_t>(payloadCrc32 & 0xFFU);
  out[8] = static_cast<uint8_t>((payloadCrc32 >> 8) & 0xFFU);
  out[9] = static_cast<uint8_t>((payloadCrc32 >> 16) & 0xFFU);
  out[10] = static_cast<uint8_t>((payloadCrc32 >> 24) & 0xFFU);
}

// 逐字节喂入的信封头扫描器：在任意垃圾/日志字节流里定位下一条合法信封。
// 返回 true 时 header() 就绪，payload 字节由调用方自行从流中接管（帧走
// FrameStreamConsumer 流式绘制，控制消息读进小缓冲），读完后 reset()。
//
// 已知取舍：头部非法时直接回到找 magic 状态，不回看被吃掉的 ≤9 字节——
// 下行流由宿主机独占写入，只有真实损坏才会走到这里，代价是多丢一条消息，
// 随后一定能在下一条信封头重同步。
class SerialEnvelopeScanner
{
public:
  bool feed(uint8_t byte)
  {
    switch (stage_)
    {
    case Stage::Magic0:
      if (byte == kSerialMagic0)
      {
        stage_ = Stage::Magic1;
      }
      return false;

    case Stage::Magic1:
      if (byte == kSerialMagic1)
      {
        stage_ = Stage::Header;
        index_ = 0;
        return false;
      }
      // 连续 0xA5：仍可能是下一个 magic 的开头。
      stage_ = (byte == kSerialMagic0) ? Stage::Magic1 : Stage::Magic0;
      return false;

    case Stage::Header:
      buffer_[index_++] = byte;
      if (index_ < sizeof(buffer_))
      {
        return false;
      }
      header_.type = buffer_[0];
      header_.length = readLe32(buffer_ + 1);
      header_.crc32 = readLe32(buffer_ + 5);
      if (!isKnownSerialType(header_.type) || header_.length > serialMaxPayload(header_.type))
      {
        stage_ = Stage::Magic0;
        return false;
      }
      stage_ = Stage::Ready;
      return true;

    case Stage::Ready:
    default:
      // 就绪后不再消费字节，调用方读完 payload 必须 reset()。
      return true;
    }
  }

  const SerialEnvelopeHeader &header() const
  {
    return header_;
  }

  void reset()
  {
    stage_ = Stage::Magic0;
    index_ = 0;
  }

private:
  enum class Stage : uint8_t
  {
    Magic0,
    Magic1,
    Header,
    Ready,
  };

  uint8_t buffer_[kSerialEnvelopeHeaderSize - 2] = {};
  std::size_t index_ = 0;
  Stage stage_ = Stage::Magic0;
  SerialEnvelopeHeader header_;
};

} // namespace remote

#endif // REMOTE_SERIAL_PROTOCOL_H
