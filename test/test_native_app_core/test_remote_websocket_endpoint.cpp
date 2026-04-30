#include <doctest.h>

#include "app/RemoteWebSocketEndpoint.h"

TEST_CASE("remote websocket endpoint parses http base urls")
{
  app::RemoteWebSocketEndpoint endpoint;

  REQUIRE(app::parseRemoteWebSocketEndpoint("http://192.168.1.7:18080/", "desk-01", 42, 10, endpoint));

  CHECK(endpoint.host == "192.168.1.7");
  CHECK(endpoint.port == 18080);
  CHECK(endpoint.path == "/api/v1/devices/desk-01/frames/ws?have=42&wait_ms=10");
}

TEST_CASE("remote websocket endpoint rejects unsupported urls")
{
  app::RemoteWebSocketEndpoint endpoint;

  CHECK_FALSE(app::parseRemoteWebSocketEndpoint("https://example.com", "desk-01", 0, 10, endpoint));
  CHECK_FALSE(app::parseRemoteWebSocketEndpoint("http://", "desk-01", 0, 10, endpoint));
  CHECK_FALSE(app::parseRemoteWebSocketEndpoint("http://192.168.1.7", "", 0, 10, endpoint));
}
