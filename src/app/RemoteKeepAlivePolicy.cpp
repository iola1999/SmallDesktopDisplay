#include "app/RemoteKeepAlivePolicy.h"

namespace app
{

std::string normalizeRemoteKeepAliveBaseUrl(const std::string &baseUrl)
{
  std::string normalized = baseUrl;
  while (!normalized.empty() && normalized.back() == '/')
  {
    normalized.pop_back();
  }
  return normalized;
}

bool RemoteKeepAlivePolicy::shouldResetBeforeRequest(const std::string &baseUrl) const
{
  if (activeBaseUrl_.empty())
  {
    return false;
  }
  return activeBaseUrl_ != normalizeRemoteKeepAliveBaseUrl(baseUrl);
}

void RemoteKeepAlivePolicy::rememberSuccessfulRequest(const std::string &baseUrl)
{
  activeBaseUrl_ = normalizeRemoteKeepAliveBaseUrl(baseUrl);
}

void RemoteKeepAlivePolicy::clear()
{
  activeBaseUrl_.clear();
}

} // namespace app
