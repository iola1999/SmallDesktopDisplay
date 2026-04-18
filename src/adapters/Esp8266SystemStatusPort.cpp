#include "adapters/Esp8266SystemStatusPort.h"

#include <Arduino.h>
#include <ESP8266WiFi.h>

#include "Net.h"

namespace adapters
{

app::DiagnosticsSnapshot Esp8266SystemStatusPort::capture(const app::AppConfigData &config,
                                                          const app::AppRuntimeState &runtime) const
{
  app::DiagnosticsSnapshot snapshot;
  snapshot.valid = true;
  snapshot.freeHeapBytes = ESP.getFreeHeap();
  snapshot.programFlashUsedBytes = ESP.getSketchSize();
  snapshot.programFlashTotalBytes = ESP.getSketchSize() + ESP.getFreeSketchSpace();
  snapshot.savedWifiSsid = config.wifiSsid;
  snapshot.wifiLinkConnected = (WiFi.status() == WL_CONNECTED);
  snapshot.activeWifiSsid = snapshot.wifiLinkConnected ? WiFi.SSID().c_str() : "-";
  snapshot.wifiRadioAwake = net::isWifiAwake();
  snapshot.lastWeatherSyncEpoch = runtime.lastWeatherSyncEpoch;
  snapshot.refreshIntervalMinutes = config.weatherUpdateMinutes;
  return snapshot;
}

} // namespace adapters
