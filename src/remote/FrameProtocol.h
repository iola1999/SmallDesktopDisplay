#ifndef REMOTE_FRAME_PROTOCOL_H
#define REMOTE_FRAME_PROTOCOL_H

#include <cstddef>
#include <cstdint>

namespace remote
{

constexpr std::size_t kFrameHeaderSize = 32;
constexpr std::size_t kRectHeaderSize = 16;
constexpr uint8_t kVersion = 1;
constexpr uint8_t kFlagFullFrame = 0x01;
constexpr uint8_t kFlagResetRequired = 0x02;
constexpr uint8_t kFormatRgb565 = 1;
constexpr uint8_t kEncodingRaw = 0;

struct FrameHeader
{
  uint8_t version = 0;
  uint8_t flags = 0;
  uint16_t headerLength = 0;
  uint32_t frameId = 0;
  uint32_t baseFrameId = 0;
  uint16_t width = 0;
  uint16_t height = 0;
  uint16_t rectCount = 0;
  uint32_t payloadLength = 0;
  uint32_t crc32 = 0;
  bool fullFrame = false;
  bool resetRequired = false;
};

struct RectHeader
{
  uint16_t x = 0;
  uint16_t y = 0;
  uint16_t width = 0;
  uint16_t height = 0;
  uint8_t format = 0;
  uint8_t encoding = 0;
  uint32_t payloadLength = 0;
};

inline uint16_t readLe16(const uint8_t *data)
{
  return static_cast<uint16_t>(data[0]) |
         static_cast<uint16_t>(static_cast<uint16_t>(data[1]) << 8);
}

inline uint32_t readLe32(const uint8_t *data)
{
  return static_cast<uint32_t>(data[0]) |
         (static_cast<uint32_t>(data[1]) << 8) |
         (static_cast<uint32_t>(data[2]) << 16) |
         (static_cast<uint32_t>(data[3]) << 24);
}

inline bool parseFrameHeader(const uint8_t *data, std::size_t length, FrameHeader &out)
{
  if (data == nullptr || length < kFrameHeaderSize)
  {
    return false;
  }

  if (data[0] != 'S' || data[1] != 'D' || data[2] != 'D' || data[3] != '1')
  {
    return false;
  }

  out.version = data[4];
  out.flags = data[5];
  out.headerLength = readLe16(data + 6);
  out.frameId = readLe32(data + 8);
  out.baseFrameId = readLe32(data + 12);
  out.width = readLe16(data + 16);
  out.height = readLe16(data + 18);
  out.rectCount = readLe16(data + 20);
  out.payloadLength = readLe32(data + 22);
  out.crc32 = readLe32(data + 28);
  out.fullFrame = (out.flags & kFlagFullFrame) != 0;
  out.resetRequired = (out.flags & kFlagResetRequired) != 0;

  return out.version == kVersion &&
         out.headerLength == kFrameHeaderSize &&
         out.width > 0 &&
         out.height > 0;
}

inline bool parseRectHeader(const uint8_t *data, std::size_t length, RectHeader &out)
{
  if (data == nullptr || length < kRectHeaderSize)
  {
    return false;
  }

  out.x = readLe16(data);
  out.y = readLe16(data + 2);
  out.width = readLe16(data + 4);
  out.height = readLe16(data + 6);
  out.format = data[8];
  out.encoding = data[9];
  out.payloadLength = readLe32(data + 12);

  if (out.width == 0 || out.height == 0)
  {
    return false;
  }

  return out.format == kFormatRgb565 && out.encoding == kEncodingRaw;
}

inline uint32_t crc32Begin()
{
  return 0xFFFFFFFFUL;
}

inline uint32_t crc32Update(uint32_t crc, const uint8_t *data, std::size_t length)
{
  for (std::size_t index = 0; index < length; ++index)
  {
    crc ^= data[index];
    for (uint8_t bit = 0; bit < 8; ++bit)
    {
      const uint32_t mask = static_cast<uint32_t>(0U - (crc & 1U));
      crc = (crc >> 1) ^ (0xEDB88320UL & mask);
    }
  }
  return crc;
}

inline uint32_t crc32Finish(uint32_t crc)
{
  return crc ^ 0xFFFFFFFFUL;
}

} // namespace remote

#endif // REMOTE_FRAME_PROTOCOL_H
