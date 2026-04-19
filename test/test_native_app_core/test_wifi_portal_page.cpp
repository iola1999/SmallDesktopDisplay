#include <doctest.h>

#include "app/WifiPortalPage.h"

#include <vector>

TEST_CASE("wifi portal page renders nearby ssids and city code guidance")
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
    "101210102",
    "");

  CHECK(html.find("Office-5G") != std::string::npos);
  CHECK(html.find("Office-2G") != std::string::npos);
  CHECK(html.find("Nearby WiFi") != std::string::npos);
  CHECK(html.find("City code") != std::string::npos);
  CHECK(html.find("0 or blank = auto detect") != std::string::npos);
  CHECK(html.find("value='Office-5G'") != std::string::npos);
  CHECK(html.find("value='101210102'") != std::string::npos);
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
    "",
    "");

  CHECK(html.find("192.168.1.23") != std::string::npos);
  CHECK(html.find("same LAN") != std::string::npos);
  CHECK(html.find("Connect to AP") == std::string::npos);
  CHECK(html.find("Save and Restart") != std::string::npos);
}

TEST_CASE("wifi portal city code input keeps auto detect semantics")
{
  CHECK(app::normalizeCityCodeInput("") == "");
  CHECK(app::normalizeCityCodeInput("0") == "");
  CHECK(app::normalizeCityCodeInput(" 0 ") == "");
  CHECK(app::normalizeCityCodeInput("101210102") == "101210102");
  CHECK(app::normalizeCityCodeInput("abc") == "");
  CHECK(app::normalizeCityCodeInput("1234") == "");
}
