#include "adapters/Esp8266SystemStatusPort.h"

#include <Arduino.h>
#include <ESP8266WiFi.h>

#include "AppConfig.h"
#include "Net.h"

namespace adapters
{

app::DiagnosticsSnapshot Esp8266SystemStatusPort::capture(const app::AppConfigData &config,
                                                          const app::AppRuntimeState &runtime) const
{
  app::DiagnosticsSnapshot snapshot;
  snapshot.valid = true;
  snapshot.ramTotalBytes = app_config::kEsp8266RamTotalBytes;
  snapshot.freeHeapBytes = ESP.getFreeHeap();
  snapshot.maxFreeBlockBytes = ESP.getMaxFreeBlockSize();
  snapshot.heapFragmentationPercent = ESP.getHeapFragmentation();
  snapshot.programFlashUsedBytes = ESP.getSketchSize();
  snapshot.programFlashTotalBytes = ESP.getSketchSize() + ESP.getFreeSketchSpace();
  snapshot.savedWifiSsid = config.wifiSsid;
  snapshot.wifiLinkConnected = (WiFi.status() == WL_CONNECTED);
  snapshot.activeWifiSsid = snapshot.wifiLinkConnected ? WiFi.SSID().c_str() : "-";
  if (snapshot.wifiLinkConnected)
  {
    const String wifiLocalIp = WiFi.localIP().toString();
    snapshot.wifiLocalIp = wifiLocalIp.c_str();
  }
  else
  {
    snapshot.wifiLocalIp = "disconnected";
  }
  snapshot.wifiRadioAwake = net::isWifiAwake();
  snapshot.lastWeatherSyncEpoch = runtime.lastWeatherSyncEpoch;
  snapshot.refreshIntervalMinutes = config.weatherUpdateMinutes;
  return snapshot;
}

} // namespace adapters
