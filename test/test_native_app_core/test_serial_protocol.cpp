#include <doctest.h>

#include "remote/SerialProtocol.h"

#include <cstdint>
#include <cstring>
#include <vector>

namespace
{

// 把字节序列喂给扫描器，返回就绪时已消费的字节数（未就绪返回 -1）。
int feedAll(remote::SerialEnvelopeScanner &scanner, const std::vector<uint8_t> &bytes)
{
  for (std::size_t index = 0; index < bytes.size(); ++index)
  {
    if (scanner.feed(bytes[index]))
    {
      return static_cast<int>(index + 1);
    }
  }
  return -1;
}

std::vector<uint8_t> encodeEnvelope(uint8_t type, const std::vector<uint8_t> &payload)
{
  uint32_t crc = remote::crc32Begin();
  if (!payload.empty())
  {
    crc = remote::crc32Update(crc, payload.data(), payload.size());
  }
  uint8_t header[remote::kSerialEnvelopeHeaderSize];
  remote::encodeSerialEnvelopeHeader(type, static_cast<uint32_t>(payload.size()), remote::crc32Finish(crc), header);

  std::vector<uint8_t> out(header, header + sizeof(header));
  out.insert(out.end(), payload.begin(), payload.end());
  return out;
}

} // namespace

TEST_CASE("serial envelope header round-trips through the scanner")
{
  const std::vector<uint8_t> payload = {'{', '}', '\n'};
  const std::vector<uint8_t> wire = encodeEnvelope(remote::kSerialMsgHello, payload);

  remote::SerialEnvelopeScanner scanner;
  const int consumed = feedAll(scanner, wire);

  CHECK(consumed == static_cast<int>(remote::kSerialEnvelopeHeaderSize));
  CHECK(scanner.header().type == remote::kSerialMsgHello);
  CHECK(scanner.header().length == payload.size());

  uint32_t crc = remote::crc32Begin();
  crc = remote::crc32Update(crc, payload.data(), payload.size());
  CHECK(scanner.header().crc32 == remote::crc32Finish(crc));
}

TEST_CASE("scanner resyncs across leading garbage and log text")
{
  std::vector<uint8_t> wire;
  const char *log = "[RemoteFrame] frame=7 partial rects=2\n";
  wire.insert(wire.end(), log, log + std::strlen(log));
  // 日志里孤立的 0xA5 不应卡住扫描器
  wire.push_back(0xA5);
  wire.push_back('x');
  const std::vector<uint8_t> envelope = encodeEnvelope(remote::kSerialMsgFrame, {1, 2, 3, 4});
  wire.insert(wire.end(), envelope.begin(), envelope.end());

  remote::SerialEnvelopeScanner scanner;
  const int consumed = feedAll(scanner, wire);

  CHECK(consumed == static_cast<int>(wire.size() - 4));
  CHECK(scanner.header().type == remote::kSerialMsgFrame);
  CHECK(scanner.header().length == 4);
}

TEST_CASE("scanner treats repeated 0xA5 as a possible magic start")
{
  std::vector<uint8_t> wire = {0xA5, 0xA5, 0x5A};
  const std::vector<uint8_t> envelope = encodeEnvelope(remote::kSerialMsgCommandAck, {'{', '}'});
  // 0xA5 0xA5 0x5A 后跟 9 个头字节：第二个 0xA5 + 0x5A 是真正的 magic，
  // 后续字节组成 type=非法 的头会被拒绝——这里直接拼一条完整合法信封验证
  // "A5 A5 5A" 前缀不会让扫描器错位。
  wire.clear();
  wire.push_back(0xA5);
  wire.insert(wire.end(), envelope.begin(), envelope.end());

  remote::SerialEnvelopeScanner scanner;
  const int consumed = feedAll(scanner, wire);
  CHECK(consumed == static_cast<int>(1 + remote::kSerialEnvelopeHeaderSize));
  CHECK(scanner.header().type == remote::kSerialMsgCommandAck);
}

TEST_CASE("scanner rejects unknown types and oversized payloads then recovers")
{
  // 非法 type
  std::vector<uint8_t> bad = encodeEnvelope(0x7F, {1});
  remote::SerialEnvelopeScanner scanner;
  CHECK(feedAll(scanner, bad) == -1);

  // 控制消息超长
  std::vector<uint8_t> oversized = encodeEnvelope(remote::kSerialMsgHello, {});
  oversized[3] = 0xFF;
  oversized[4] = 0xFF; // length = 65535 > kSerialMaxControlPayload
  CHECK(feedAll(scanner, oversized) == -1);

  // 之后的合法信封仍能被识别
  const std::vector<uint8_t> good = encodeEnvelope(remote::kSerialMsgInput, {'{', '}'});
  CHECK(feedAll(scanner, good) == static_cast<int>(remote::kSerialEnvelopeHeaderSize));
  CHECK(scanner.header().type == remote::kSerialMsgInput);
}

TEST_CASE("scanner holds ready state until reset")
{
  const std::vector<uint8_t> envelope = encodeEnvelope(remote::kSerialMsgFrameAck, {'{', '}'});
  remote::SerialEnvelopeScanner scanner;
  CHECK(feedAll(scanner, envelope) == static_cast<int>(remote::kSerialEnvelopeHeaderSize));
  // 就绪后继续喂字节不消费也不破坏 header
  CHECK(scanner.feed(0x00));
  CHECK(scanner.header().type == remote::kSerialMsgFrameAck);

  scanner.reset();
  const std::vector<uint8_t> next = encodeEnvelope(remote::kSerialMsgStatus, {'{', '}'});
  CHECK(feedAll(scanner, next) == static_cast<int>(remote::kSerialEnvelopeHeaderSize));
  CHECK(scanner.header().type == remote::kSerialMsgStatus);
}
