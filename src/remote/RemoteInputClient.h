#ifndef REMOTE_INPUT_CLIENT_H
#define REMOTE_INPUT_CLIENT_H

#include <Arduino.h>
#include <cstdint>

namespace remote
{

class RemoteInputClient
{
public:
  bool postEvent(const String &baseUrl,
                 const String &deviceId,
                 uint32_t sequence,
                 const char *eventName,
                 uint32_t uptimeMs);
};

} // namespace remote

#endif // REMOTE_INPUT_CLIENT_H
