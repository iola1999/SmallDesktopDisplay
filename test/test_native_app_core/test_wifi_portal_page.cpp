#include <doctest.h>

#include "app/WifiPortalPage.h"

#include <vector>

TEST_CASE("wifi portal page renders nearby ssids and remote render settings")
{
  const std::vector<app::WifiPortalNetwork> networks{
    {"Office-5G", -42, true},
    {"Office-2G", -55, false},
  };

  const std::string html = app::buildWifiPortalPage(
    "SDD-Setup",
    "192.168.4.1",
    networks,
    "Office-5G",
    "http://192.168.1.20:8080",
    "desk-01",
    "");

  CHECK(html.find("Office-5G") != std::string::npos);
  CHECK(html.find("Office-2G") != std::string::npos);
  CHECK(html.find("Nearby WiFi") != std::string::npos);
  CHECK(html.find("Render server") != std::string::npos);
  CHECK(html.find("Device ID") != std::string::npos);
  CHECK(html.find("value='Office-5G'") != std::string::npos);
  CHECK(html.find("value='http://192.168.1.20:8080'") != std::string::npos);
  CHECK(html.find("value='desk-01'") != std::string::npos);
}

TEST_CASE("wifi portal page reuses the same form for LAN access")
{
  const std::vector<app::WifiPortalNetwork> networks{
    {"Office-5G", -42, true},
  };

  const std::string html = app::buildWifiPortalPage(
    "",
    "192.168.1.23",
    networks,
    "Office-5G",
    "http://192.168.1.20:8080",
    "desk-01",
    "");

  CHECK(html.find("192.168.1.23") != std::string::npos);
  CHECK(html.find("same LAN") != std::string::npos);
  CHECK(html.find("Connect to AP") == std::string::npos);
  CHECK(html.find("Save and Restart") != std::string::npos);
}

TEST_CASE("wifi portal remote url normalization keeps http server semantics")
{
  CHECK(app::normalizeRemoteBaseUrlInput(" http://192.168.1.20:8080/ ") ==
        "http://192.168.1.20:8080");
  CHECK(app::normalizeRemoteBaseUrlInput("https://render.local") == "");
  CHECK(app::normalizeRemoteBaseUrlInput("render.local:8080") == "");
  CHECK(app::normalizeRemoteBaseUrlInput("") == "");
}
