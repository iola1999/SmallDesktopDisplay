#ifndef REMOTE_FRAME_STREAM_CONSUMER_H
#define REMOTE_FRAME_STREAM_CONSUMER_H

#include <cstddef>
#include <cstdint>

#include "app/FrameDiagnostics.h"
#include "remote/ByteSource.h"
#include "remote/FrameProtocol.h"
#include "ui/TftFrameSink.h"

namespace remote
{

// SDD1 帧体的流式消费器：逐 rect 读取→（RLE 解码）→按批画到 TFT。
// HTTP 与串口两条链路共用一个实例，省一份 960B 的行块缓冲。
// 32B 帧头由各链路自行读取/解析后传入（HTTP 要先剥响应头，串口要先剥信封头）。
class FrameStreamConsumer
{
public:
  explicit FrameStreamConsumer(ui::TftFrameSink &sink) : sink_(sink)
  {
  }

  // 消费 header 描述的全部 rect 并校验 CRC。失败时屏幕可能已被部分绘制，
  // 调用方应保持 have 不变，等待服务端整屏/补差重同步。
  bool consumeBody(ByteSource &source, const FrameHeader &header, app::FrameDiagnostics &diagnostics,
                   uint32_t timeoutMs);

  // 从 source 精确读满 length 字节；超过 timeoutMs 没有任何进展则失败。
  bool readExact(ByteSource &source, uint8_t *buffer, std::size_t length, uint32_t &elapsedMs,
                 app::FrameDiagnostics &diagnostics, uint32_t timeoutMs);

private:
  bool consumeRawRect(ByteSource &source, const RectHeader &rect, uint32_t &crc, app::FrameDiagnostics &diagnostics,
                      uint32_t timeoutMs);
  bool consumeRleRect(ByteSource &source, const RectHeader &rect, uint32_t &crc, app::FrameDiagnostics &diagnostics,
                      uint32_t timeoutMs);

  ui::TftFrameSink &sink_;
  // 解码/绘制共用的行块缓冲（480 像素 = 960B）。放成员而不是栈上：ESP8266
  // 任务栈只有 ~4KB；对象本身是全局静态，成员落在 BSS 不占堆。
  uint16_t rowBuffer_[kFrameBatchPixels] = {};
};

} // namespace remote

#endif // REMOTE_FRAME_STREAM_CONSUMER_H
