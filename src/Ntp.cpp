#include "Ntp.h"

#include <Arduino.h>
#include <ESP8266WiFi.h>
#include <WiFiUdp.h>

#include "AppConfig.h"

namespace ntp
{

namespace
{

constexpr int kPacketSize = 48;
WiFiUDP s_udp;
byte s_packet[kPacketSize];

void sendRequest(IPAddress &addr)
{
  memset(s_packet, 0, kPacketSize);
  s_packet[0] = 0b11100011;
  s_packet[1] = 0;
  s_packet[2] = 6;
  s_packet[3] = 0xEC;
  s_packet[12] = 49;
  s_packet[13] = 0x4E;
  s_packet[14] = 49;
  s_packet[15] = 52;
  s_udp.beginPacket(addr, 123);
  s_udp.write(s_packet, kPacketSize);
  s_udp.endPacket();
}

time_t fetch()
{
  IPAddress ip;
  while (s_udp.parsePacket() > 0)
    ;

  WiFi.hostByName(app_config::kNtpServer, ip);
  sendRequest(ip);
  uint32_t deadline = millis() + 1500;
  while (millis() < deadline)
  {
    int size = s_udp.parsePacket();
    if (size >= kPacketSize)
    {
      s_udp.read(s_packet, kPacketSize);
      unsigned long secs = (unsigned long)s_packet[40] << 24;
      secs |= (unsigned long)s_packet[41] << 16;
      secs |= (unsigned long)s_packet[42] << 8;
      secs |= (unsigned long)s_packet[43];
      return secs - 2208988800UL + app_config::kTimeZoneOffsetHours * SECS_PER_HOUR;
    }
  }
  Serial.println(F("[Ntp] no response"));
  return 0;
}

} // namespace

void begin()
{
  s_udp.begin(app_config::kUdpLocalPort);
  setSyncProvider(fetch);
  setSyncInterval(app_config::kNtpSyncIntervalSec);
}

bool syncOnce(uint32_t &epochSeconds)
{
  const time_t value = fetch();
  if (value <= 0)
  {
    epochSeconds = 0;
    return false;
  }

  setTime(value);
  epochSeconds = static_cast<uint32_t>(value);
  return true;
}

} // namespace ntp
