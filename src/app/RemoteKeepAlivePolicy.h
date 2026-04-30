#ifndef APP_REMOTE_KEEP_ALIVE_POLICY_H
#define APP_REMOTE_KEEP_ALIVE_POLICY_H

#include <string>

namespace app
{

std::string normalizeRemoteKeepAliveBaseUrl(const std::string &baseUrl);

class RemoteKeepAlivePolicy
{
public:
  bool shouldResetBeforeRequest(const std::string &baseUrl) const;
  void rememberSuccessfulRequest(const std::string &baseUrl);
  void clear();

private:
  std::string activeBaseUrl_;
};

} // namespace app

#endif // APP_REMOTE_KEEP_ALIVE_POLICY_H
