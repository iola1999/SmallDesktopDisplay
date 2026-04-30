#ifndef REMOTE_COMMAND_CLIENT_H
#define REMOTE_COMMAND_CLIENT_H

#include "remote/DeviceCommand.h"

#include <Arduino.h>
#include <cstdint>

namespace remote
{

enum class CommandFetchResult
{
  Updated,
  NotModified,
  Failed,
};

class RemoteCommandClient
{
public:
  CommandFetchResult fetchLatest(const String &baseUrl, const String &deviceId, uint32_t afterCommandId,
                                 DeviceCommand &outCommand);
};

} // namespace remote

#endif // REMOTE_COMMAND_CLIENT_H
