#ifndef APP_REMOTE_WEBSOCKET_ENDPOINT_H
#define APP_REMOTE_WEBSOCKET_ENDPOINT_H

#include <cstdint>
#include <string>

namespace app
{

struct RemoteWebSocketEndpoint
{
  std::string host;
  uint16_t port = 80;
  std::string path;
};

bool parseRemoteWebSocketEndpoint(const std::string &baseUrl, const std::string &deviceId, uint32_t haveFrameId,
                                  uint32_t waitMs, RemoteWebSocketEndpoint &out);

} // namespace app

#endif // APP_REMOTE_WEBSOCKET_ENDPOINT_H
