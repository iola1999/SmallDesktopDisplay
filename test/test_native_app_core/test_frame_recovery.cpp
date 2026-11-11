#include <doctest.h>

#include "remote/SerialFrameLink.h"

#include <string>
#include <utility>
#include <vector>

EspStub ESP;
HardwareSerial Serial;

namespace
{

uint16_t screen[2] = {};

void put16(std::vector<uint8_t> &bytes, std::size_t offset, uint16_t value)
{
  bytes[offset] = value;
  bytes[offset + 1] = value >> 8;
}

void put32(std::vector<uint8_t> &bytes, std::size_t offset, uint32_t value)
{
  for (int index = 0; index < 4; ++index)
  {
    bytes[offset + index] = value >> (8 * index);
  }
}

std::vector<uint8_t> frameEnvelope(uint32_t id, uint32_t base, bool full, const std::vector<uint16_t> &pixels,
                                   bool badFrameCrc = false, bool badEnvelopeCrc = false)
{
  std::vector<uint8_t> bytes(32 + (pixels.empty() ? 0 : 16 + pixels.size() * 2));
  bytes[0] = 'S';
  bytes[1] = 'D';
  bytes[2] = 'D';
  bytes[3] = '1';
  bytes[4] = 1;
  bytes[5] = full ? 1 : 0;
  put16(bytes, 6, 32);
  put32(bytes, 8, id);
  put32(bytes, 12, base);
  put16(bytes, 16, 2);
  put16(bytes, 18, 1);
  put16(bytes, 20, pixels.empty() ? 0 : 1);
  put32(bytes, 22, pixels.size() * 2);
  if (!pixels.empty())
  {
    put16(bytes, 36, pixels.size());
    put16(bytes, 38, 1);
    bytes[40] = 1;
    put32(bytes, 44, pixels.size() * 2);
    for (std::size_t index = 0; index < pixels.size(); ++index)
    {
      put16(bytes, 48 + index * 2, pixels[index]);
    }
  }
  const uint32_t frameCrc =
      remote::crc32Finish(remote::crc32Update(remote::crc32Begin(), bytes.data() + 32, bytes.size() - 32));
  put32(bytes, 28, frameCrc ^ (badFrameCrc ? 1U : 0U));
  const uint32_t envelopeCrc =
      remote::crc32Finish(remote::crc32Update(remote::crc32Begin(), bytes.data(), bytes.size()));
  uint8_t header[remote::kSerialEnvelopeHeaderSize];
  remote::encodeSerialEnvelopeHeader(remote::kSerialMsgFrame, bytes.size(), envelopeCrc ^ (badEnvelopeCrc ? 1U : 0U),
                                     header);
  std::vector<uint8_t> result(header, header + sizeof(header));
  result.insert(result.end(), bytes.begin(), bytes.end());
  return result;
}

} // namespace

namespace ui
{

void TftFrameSink::drawRgb565Block(uint16_t x, uint16_t y, uint16_t width, uint16_t height, const uint16_t *pixels)
{
  REQUIRE(y == 0);
  REQUIRE(height == 1);
  REQUIRE(x + width <= 2);
  for (uint16_t index = 0; index < width; ++index)
  {
    screen[x + index] = pixels[index];
  }
}

} // namespace ui

TEST_CASE("serial frame CRC failure requests a full frame after pixels were already written")
{
  bool badFrameCrc = true;
  SUBCASE("SDD1 frame CRC mismatch")
  {
  }
  SUBCASE("serial envelope CRC mismatch")
  {
    badFrameCrc = false;
  }

  HardwareSerial port;
  ui::TftFrameSink sink;
  remote::FrameStreamConsumer consumer(sink);
  remote::SerialFrameLink link(port, consumer);
  auto receive = [&](std::vector<uint8_t> bytes)
  {
    port.incoming = std::move(bytes);
    port.offset = 0;
    port.outgoing.clear();
    return link.tick(millis(), true);
  };

  REQUIRE(receive(frameEnvelope(1, 0, true, {0x1111, 0x2222})).frameDrawn);
  REQUIRE(link.haveFrameId() == 1);
  CHECK_FALSE(receive(frameEnvelope(2, 1, false, {0x3333}, badFrameCrc, !badFrameCrc)).frameDrawn);
  REQUIRE(screen[0] == 0x3333);
  CHECK(link.haveFrameId() == 0);
  REQUIRE(port.outgoing.size() > remote::kSerialEnvelopeHeaderSize);
  CHECK(std::string(port.outgoing.begin() + remote::kSerialEnvelopeHeaderSize, port.outgoing.end()) ==
        "{\"frame_id\":0}");

  // 新目标的首像素恢复为旧值；只有完整帧能保证清除失败帧已经写入的值。
  REQUIRE(receive(frameEnvelope(3, 0, true, {0x1111, 0x4444})).frameDrawn);
  CHECK(link.haveFrameId() == 3);
  CHECK(screen[0] == 0x1111);
  CHECK(screen[1] == 0x4444);
}

TEST_CASE("serial empty partial keeps the acknowledged frame and pixels while updating link health")
{
  HardwareSerial port;
  ui::TftFrameSink sink;
  remote::FrameStreamConsumer consumer(sink);
  remote::SerialFrameLink link(port, consumer);
  port.incoming = frameEnvelope(7, 0, true, {0x1234, 0x5678});
  REQUIRE(link.tick(millis(), true).frameDrawn);
  const uint32_t previousDownlink = link.lastDownlinkMs();

  port.incoming = frameEnvelope(7, 7, false, {});
  port.offset = 0;
  port.outgoing.clear();
  const remote::SerialTickResult result = link.tick(millis(), true);
  CHECK(result.sawValidEnvelope);
  CHECK(link.lastDownlinkMs() > previousDownlink);
  CHECK(link.haveFrameId() == 7);
  CHECK(screen[0] == 0x1234);
  CHECK(screen[1] == 0x5678);
  REQUIRE(port.outgoing.size() > remote::kSerialEnvelopeHeaderSize);
  CHECK(std::string(port.outgoing.begin() + remote::kSerialEnvelopeHeaderSize, port.outgoing.end()) ==
        "{\"frame_id\":7}");
}
