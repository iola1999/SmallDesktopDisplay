#ifndef APP_WIFI_PORTAL_PAGE_H
#define APP_WIFI_PORTAL_PAGE_H

#include <cstdint>
#include <string>
#include <vector>

namespace app
{

struct WifiPortalNetwork
{
  std::string ssid;
  int32_t rssi = 0;
  bool encrypted = true;
};

std::string normalizeCityCodeInput(const std::string &input);
std::string buildWifiPortalPage(const std::string &apSsid,
                                const std::string &portalIp,
                                const std::vector<WifiPortalNetwork> &networks,
                                const std::string &selectedSsid,
                                const std::string &cityCode,
                                const std::string &message);

} // namespace app

#endif // APP_WIFI_PORTAL_PAGE_H
