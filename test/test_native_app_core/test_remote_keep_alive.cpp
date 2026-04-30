#include <doctest.h>

#include "app/RemoteKeepAlivePolicy.h"

TEST_CASE("remote keep-alive normalizes base urls for reuse")
{
  CHECK(app::normalizeRemoteKeepAliveBaseUrl("http://192.168.1.7:18080/") == "http://192.168.1.7:18080");
  CHECK(app::normalizeRemoteKeepAliveBaseUrl("http://192.168.1.7:18080///") == "http://192.168.1.7:18080");
}

TEST_CASE("remote keep-alive resets only when the base url changes")
{
  app::RemoteKeepAlivePolicy policy;

  CHECK_FALSE(policy.shouldResetBeforeRequest("http://192.168.1.7:18080/"));
  policy.rememberSuccessfulRequest("http://192.168.1.7:18080/");

  CHECK_FALSE(policy.shouldResetBeforeRequest("http://192.168.1.7:18080"));
  CHECK(policy.shouldResetBeforeRequest("http://192.168.1.8:18080"));

  policy.clear();
  CHECK_FALSE(policy.shouldResetBeforeRequest("http://192.168.1.8:18080"));
}
