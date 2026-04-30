#include "app/RemoteWebSocketEndpoint.h"

#include <cstdio>
#include <cstdlib>

namespace app
{

namespace
{

std::string trimTrailingSlashes(std::string value)
{
  while (!value.empty() && value.back() == '/')
  {
    value.pop_back();
  }
  return value;
}

bool parsePort(const std::string &value, uint16_t &out)
{
  if (value.empty())
  {
    return false;
  }

  char *end = nullptr;
  const unsigned long parsed = std::strtoul(value.c_str(), &end, 10);
  if (end == value.c_str() || *end != '\0' || parsed == 0 || parsed > UINT16_MAX)
  {
    return false;
  }

  out = static_cast<uint16_t>(parsed);
  return true;
}

std::string formatUint32(uint32_t value)
{
  char buffer[11];
  snprintf(buffer, sizeof(buffer), "%lu", static_cast<unsigned long>(value));
  return buffer;
}

} // namespace

bool parseRemoteWebSocketEndpoint(const std::string &baseUrl, const std::string &deviceId, uint32_t haveFrameId,
                                  uint32_t waitMs, RemoteWebSocketEndpoint &out)
{
  constexpr const char *kHttpPrefix = "http://";
  if (baseUrl.rfind(kHttpPrefix, 0) != 0 || deviceId.empty())
  {
    return false;
  }

  std::string authority = trimTrailingSlashes(baseUrl.substr(7));
  const std::size_t slash = authority.find('/');
  if (slash != std::string::npos)
  {
    authority = authority.substr(0, slash);
  }
  if (authority.empty())
  {
    return false;
  }

  uint16_t port = 80;
  std::string host = authority;
  const std::size_t colon = authority.rfind(':');
  if (colon != std::string::npos)
  {
    host = authority.substr(0, colon);
    if (!parsePort(authority.substr(colon + 1), port))
    {
      return false;
    }
  }
  if (host.empty())
  {
    return false;
  }

  out.host = host;
  out.port = port;
  out.path = "/api/v1/devices/" + deviceId + "/frames/ws?have=" + formatUint32(haveFrameId) +
             "&wait_ms=" + formatUint32(waitMs);
  return true;
}

} // namespace app
