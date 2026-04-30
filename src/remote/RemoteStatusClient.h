#ifndef REMOTE_STATUS_CLIENT_H
#define REMOTE_STATUS_CLIENT_H

#include <Arduino.h>
#include <cstdint>

namespace remote
{

class RemoteStatusClient
{
public:
  bool postStatus(const String &baseUrl, const String &deviceId, uint8_t brightness, uint32_t uptimeMs,
                  uint32_t heapFree, uint32_t heapMaxBlock, uint8_t heapFragmentation, int16_t wifiRssi);
};

} // namespace remote

#endif // REMOTE_STATUS_CLIENT_H
