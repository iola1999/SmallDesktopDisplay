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
std::string normalizeRemoteBaseUrlInput(const std::string &input);
std::string normalizeDeviceIdInput(const std::string &input);
// 同 SSID 留空保留原密码；新 SSID 留空或显式清除表示开放网络。密码保留原始空格。
std::string resolveWifiPortalPassword(const std::string &savedSsid,
                                     const std::string &savedPassword,
                                     const std::string &submittedSsid,
                                     const std::string &submittedPassword,
                                     bool clearPassword);
std::string buildWifiPortalPage(const std::string &apSsid,
                                const std::string &portalIp,
                                const std::vector<WifiPortalNetwork> &networks,
                                const std::string &selectedSsid,
                                const std::string &remoteBaseUrl,
                                const std::string &deviceId,
                                const std::string &message);

} // namespace app

#endif // APP_WIFI_PORTAL_PAGE_H
