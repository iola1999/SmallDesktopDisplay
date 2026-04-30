#ifndef REMOTE_DEVICE_STATUS_PAYLOAD_H
#define REMOTE_DEVICE_STATUS_PAYLOAD_H

#include <cstddef>
#include <cstdint>
#include <cstdio>

namespace remote
{

inline bool buildDeviceStatusPayload(uint8_t brightness, uint32_t uptimeMs, char *buffer, std::size_t bufferSize)
{
  if (brightness > 100 || buffer == nullptr || bufferSize == 0)
  {
    return false;
  }

  const int written = snprintf(buffer, bufferSize, "{\"brightness\":%u,\"uptime_ms\":%lu}", brightness,
                               static_cast<unsigned long>(uptimeMs));
  return written > 0 && static_cast<std::size_t>(written) < bufferSize;
}

} // namespace remote

#endif // REMOTE_DEVICE_STATUS_PAYLOAD_H
