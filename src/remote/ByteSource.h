#ifndef REMOTE_BYTE_SOURCE_H
#define REMOTE_BYTE_SOURCE_H

#include <cstddef>
#include <cstdint>

#include "remote/FrameProtocol.h"

namespace remote
{

// 帧字节流来源抽象：HTTP(WiFiClient) 与串口(HardwareSerial) 共用同一套
// SDD1 流式解码/绘制管线（FrameStreamConsumer）。read 语义与 WiFiClient 一致：
// 非阻塞，返回实际读到的字节数，<=0 表示当前无数据。
class ByteSource
{
public:
  virtual ~ByteSource() = default;
  virtual int available() = 0;
  virtual int read(uint8_t *buffer, std::size_t length) = 0;
};

// 读取的同时累计 CRC32 与字节数：串口信封对整个 SDD1 负载有一层外层校验，
// 流式绘制没法先收完再验，只能边读边算，消费完与信封头里的值比对。
class Crc32ByteSource : public ByteSource
{
public:
  explicit Crc32ByteSource(ByteSource &inner) : inner_(inner)
  {
  }

  int available() override
  {
    return inner_.available();
  }

  int read(uint8_t *buffer, std::size_t length) override
  {
    const int count = inner_.read(buffer, length);
    if (count > 0)
    {
      crc_ = crc32Update(crc_, buffer, static_cast<std::size_t>(count));
      consumed_ += static_cast<uint32_t>(count);
    }
    return count;
  }

  uint32_t finishCrc() const
  {
    return crc32Finish(crc_);
  }

  uint32_t consumedBytes() const
  {
    return consumed_;
  }

private:
  ByteSource &inner_;
  uint32_t crc_ = crc32Begin();
  uint32_t consumed_ = 0;
};

} // namespace remote

#endif // REMOTE_BYTE_SOURCE_H
