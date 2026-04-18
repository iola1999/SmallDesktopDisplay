#include "adapters/Esp8266SystemStatusPort.h"

#include <Arduino.h>
#include <ESP8266WiFi.h>

namespace adapters
{

app::DiagnosticsSnapshot Esp8266SystemStatusPort::capture() const
{
  app::DiagnosticsSnapshot snapshot;
  snapshot.valid = true;
  snapshot.freeHeapBytes = ESP.getFreeHeap();
  snapshot.programFlashUsedBytes = ESP.getSketchSize();
  snapshot.programFlashTotalBytes = ESP.getSketchSize() + ESP.getFreeSketchSpace();
  snapshot.wifiConnected = (WiFi.status() == WL_CONNECTED);
  if (snapshot.wifiConnected)
  {
    snapshot.wifiSsid = WiFi.SSID().c_str();
  }
  return snapshot;
}

} // namespace adapters
