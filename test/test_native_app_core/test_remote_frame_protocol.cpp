#include <doctest.h>

#include "remote/FrameProtocol.h"

#include <cstdint>

TEST_CASE("remote frame parser accepts a valid full frame header")
{
  const uint8_t header[] = {
    'S', 'D', 'D', '1',
    1,
    1,
    32, 0,
    7, 0, 0, 0,
    0, 0, 0, 0,
    240, 0,
    240, 0,
    1, 0,
    8, 0, 0, 0,
    0, 0,
    0xEF, 0xBE, 0xAD, 0xDE,
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
    2, 0,
    4, 0,
    10, 0,
    12, 0,
    1,
    0,
    0, 0,
    240, 0, 0, 0,
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
