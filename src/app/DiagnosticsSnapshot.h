#ifndef APP_DIAGNOSTICS_SNAPSHOT_H
#define APP_DIAGNOSTICS_SNAPSHOT_H

#include <cstdint>
#include <string>

namespace app
{

struct DiagnosticsSnapshot
{
  bool valid = false;
  uint32_t ramTotalBytes = 0;
  uint32_t freeHeapBytes = 0;
  uint32_t maxFreeBlockBytes = 0;
  uint8_t heapFragmentationPercent = 0;
  uint32_t programFlashUsedBytes = 0;
  uint32_t programFlashTotalBytes = 0;
  std::string savedWifiSsid;
  std::string activeWifiSsid;
  std::string wifiLocalIp;
  bool wifiLinkConnected = false;
  bool wifiRadioAwake = false;
  uint32_t lastWeatherSyncEpoch = 0;
  uint32_t refreshIntervalMinutes = 0;
  std::string wifiSsid;
  bool wifiConnected = false;
};

} // namespace app

#endif // APP_DIAGNOSTICS_SNAPSHOT_H
