#ifndef REMOTE_DEVICE_STATUS_PAYLOAD_H
#define REMOTE_DEVICE_STATUS_PAYLOAD_H

#include <cstddef>
#include <cstdint>
#include <cstdio>

namespace remote
{

inline bool buildDeviceStatusPayload(uint8_t brightness, uint32_t uptimeMs, uint32_t heapFree, uint32_t heapMaxBlock,
                                     uint8_t heapFragmentation, int16_t wifiRssi, char *buffer, std::size_t bufferSize)
{
  if (brightness > 100 || heapFragmentation > 100 || buffer == nullptr || bufferSize == 0)
  {
    return false;
  }

  const int written = snprintf(buffer, bufferSize,
                               "{\"brightness\":%u,\"uptime_ms\":%lu,\"heap_free\":%lu,\"heap_max_block\":%lu,"
                               "\"heap_fragmentation\":%u,\"wifi_rssi\":%d}",
                               brightness, static_cast<unsigned long>(uptimeMs), static_cast<unsigned long>(heapFree),
                               static_cast<unsigned long>(heapMaxBlock), heapFragmentation, wifiRssi);
  return written > 0 && static_cast<std::size_t>(written) < bufferSize;
}

} // namespace remote

#endif // REMOTE_DEVICE_STATUS_PAYLOAD_H
