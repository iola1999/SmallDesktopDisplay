#include <doctest.h>

#include "remote/FrameProtocol.h"

#include <cstdint>

TEST_CASE("remote frame parser accepts a valid full frame header")
{
  const uint8_t header[] = {
      'S', 'D', 'D', '1', 1, 1, 32, 0, 7, 0, 0, 0, 0,    0,    0,    0,
      240, 0,   240, 0,   1, 0, 8,  0, 0, 0, 0, 0, 0xEF, 0xBE, 0xAD, 0xDE,
  };

  remote::FrameHeader parsed;
  CHECK(remote::parseFrameHeader(header, sizeof(header), parsed));
  CHECK(parsed.frameId == 7);
  CHECK(parsed.baseFrameId == 0);
  CHECK(parsed.fullFrame);
  CHECK(parsed.width == 240);
  CHECK(parsed.height == 240);
  CHECK(parsed.rectCount == 1);
  CHECK(parsed.payloadLength == 8);
  CHECK(parsed.crc32 == 0xDEADBEEF);
}

TEST_CASE("remote frame parser rejects wrong magic and short headers")
{
  const uint8_t shortHeader[] = {'S', 'D', 'D'};
  remote::FrameHeader parsed;
  CHECK_FALSE(remote::parseFrameHeader(shortHeader, sizeof(shortHeader), parsed));

  uint8_t badMagic[remote::kFrameHeaderSize] = {};
  badMagic[0] = 'B';
  badMagic[1] = 'A';
  badMagic[2] = 'D';
  badMagic[3] = '!';
  badMagic[4] = 1;
  badMagic[6] = remote::kFrameHeaderSize;
  CHECK_FALSE(remote::parseFrameHeader(badMagic, sizeof(badMagic), parsed));
}

TEST_CASE("remote rect parser accepts raw rgb565 rect headers")
{
  const uint8_t rect[] = {
      2, 0, 4, 0, 10, 0, 12, 0, 1, 0, 0, 0, 240, 0, 0, 0,
  };

  remote::RectHeader parsed;
  CHECK(remote::parseRectHeader(rect, sizeof(rect), parsed));
  CHECK(parsed.x == 2);
  CHECK(parsed.y == 4);
  CHECK(parsed.width == 10);
  CHECK(parsed.height == 12);
  CHECK(parsed.format == remote::kFormatRgb565);
  CHECK(parsed.encoding == remote::kEncodingRaw);
  CHECK(parsed.payloadLength == 240);
}

TEST_CASE("remote rect parser accepts rle rgb565 rect headers")
{
  const uint8_t rect[] = {
      0, 0, 0, 0, 2, 0, 2, 0, 1, 1, 0, 0, 3, 0, 0, 0,
  };

  remote::RectHeader parsed;
  CHECK(remote::parseRectHeader(rect, sizeof(rect), parsed));
  CHECK(parsed.format == remote::kFormatRgb565);
  CHECK(parsed.encoding == remote::kEncodingRgb565Rle);
  CHECK(parsed.payloadLength == 3);
}

namespace
{

// 逐位参考实现（查表版上线前的旧实现），用于验证查表结果一致。
uint32_t crc32UpdateBitwise(uint32_t crc, const uint8_t *data, std::size_t length)
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

} // namespace

TEST_CASE("table-driven crc32 matches the standard check vector")
{
  const uint8_t message[] = {'1', '2', '3', '4', '5', '6', '7', '8', '9'};
  const uint32_t crc = remote::crc32Finish(remote::crc32Update(remote::crc32Begin(), message, sizeof(message)));
  CHECK(crc == 0xCBF43926UL);
}

TEST_CASE("table-driven crc32 matches the bitwise reference across chunked updates")
{
  uint8_t data[1024];
  uint32_t seed = 0x12345678UL;
  for (std::size_t index = 0; index < sizeof(data); ++index)
  {
    seed = seed * 1664525UL + 1013904223UL;
    data[index] = static_cast<uint8_t>(seed >> 24);
  }

  uint32_t table = remote::crc32Begin();
  uint32_t bitwise = remote::crc32Begin();
  // 模拟固件按 rect 头 / 行块分段喂数据的方式。
  const std::size_t chunks[] = {16, 1, 480, 192, 335};
  std::size_t offset = 0;
  for (const std::size_t chunk : chunks)
  {
    table = remote::crc32Update(table, data + offset, chunk);
    bitwise = crc32UpdateBitwise(bitwise, data + offset, chunk);
    offset += chunk;
  }
  CHECK(offset == sizeof(data));
  CHECK(remote::crc32Finish(table) == remote::crc32Finish(bitwise));
}
