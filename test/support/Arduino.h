#ifndef TEST_SUPPORT_ARDUINO_H
#define TEST_SUPPORT_ARDUINO_H

#include <algorithm>
#include <cstddef>
#include <cstdint>
#include <vector>

// 仅供 Host 帧恢复测试使用，时间推进让缺失字节的读取能够按超时退出。
#define F(value) value
inline uint32_t millis()
{
  static uint32_t now = 0;
  return ++now;
}
inline void optimistic_yield(uint32_t)
{
}

struct EspStub
{
  void wdtFeed()
  {
  }
};
extern EspStub ESP;

class HardwareSerial
{
public:
  std::vector<uint8_t> incoming;
  std::vector<uint8_t> outgoing;
  std::size_t offset = 0;

  int available()
  {
    return static_cast<int>(incoming.size() - offset);
  }
  int read()
  {
    return available() > 0 ? incoming[offset++] : -1;
  }
  std::size_t readBytes(char *buffer, std::size_t length)
  {
    length = std::min(length, static_cast<std::size_t>(available()));
    std::copy_n(incoming.data() + offset, length, buffer);
    offset += length;
    return length;
  }
  std::size_t write(const uint8_t *buffer, std::size_t length)
  {
    outgoing.insert(outgoing.end(), buffer, buffer + length);
    return length;
  }
  void println(const char *)
  {
  }
  template <class... Args> void printf(const char *, Args...)
  {
  }
};
extern HardwareSerial Serial;

#endif // TEST_SUPPORT_ARDUINO_H
