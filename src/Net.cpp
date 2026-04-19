#include "Net.h"

#include <algorithm>
#include <vector>

#include <Arduino.h>
#include <DNSServer.h>
#include <ESP8266WebServer.h>
#include <ESP8266WiFi.h>

#include "Display.h"
#include "Storage.h"
#include "app/WifiPortalPage.h"

namespace net
{

namespace
{

constexpr uint16_t kPortalDnsPort = 53;

enum class ConfigPortalMode
{
  None,
  AccessPoint,
  LocalNetwork,
};

bool s_wifiAwake = true;
app::AppConfigData *s_config = nullptr;
DNSServer s_dnsServer;
ESP8266WebServer s_server(80);
IPAddress s_portalIp;
bool s_portalRestartRequested = false;
std::vector<app::WifiPortalNetwork> s_networks;
ConfigPortalMode s_portalMode = ConfigPortalMode::None;
bool s_serverRoutesConfigured = false;

void handlePortalRoot();
void handlePortalSave();

const char *portalModeName(ConfigPortalMode mode)
{
  switch (mode)
  {
    case ConfigPortalMode::AccessPoint:
      return "ap";

    case ConfigPortalMode::LocalNetwork:
      return "lan";

    case ConfigPortalMode::None:
    default:
      return "none";
  }
}

bool portalUsesAccessPoint()
{
  return s_portalMode == ConfigPortalMode::AccessPoint;
}

void loadingUntilConnected()
{
  uint8_t step = 1;
  while (WiFi.status() != WL_CONNECTED)
  {
    display::drawLoading(30, step);
    step = 1;
  }
  for (int index = 0; index < 194; ++index)
  {
    display::drawLoading(1, 1);
  }
}

void drawPortalInstructions()
{
  display::clear();
  display::tft.setTextColor(TFT_WHITE, app_config::kColorBg);
  display::tft.setTextDatum(CC_DATUM);
  display::tft.drawString("WiFi Setup", 120, 40, 4);
  display::tft.setTextColor(TFT_YELLOW, app_config::kColorBg);
  display::tft.drawString("Join AP", 120, 88, 2);
  display::tft.drawString(app_config::kWifiPortalApSsid, 120, 112, 4);
  display::tft.setTextColor(TFT_WHITE, app_config::kColorBg);
  display::tft.drawString("Open", 120, 156, 2);
  display::tft.drawString(s_portalIp.toString(), 120, 182, 4);
  display::tft.drawString("Pick WiFi and set city code", 120, 220, 2);
}

void scanNearbyNetworks()
{
  s_networks.clear();

  const int count = WiFi.scanNetworks(false, true);
  if (count <= 0)
  {
    WiFi.scanDelete();
    return;
  }

  for (int index = 0; index < count; ++index)
  {
    const String ssid = WiFi.SSID(index);
    if (ssid.length() == 0)
    {
      continue;
    }

    bool alreadyAdded = false;
    for (const auto &network : s_networks)
    {
      if (network.ssid == ssid.c_str())
      {
        alreadyAdded = true;
        break;
      }
    }
    if (alreadyAdded)
    {
      continue;
    }

    app::WifiPortalNetwork network;
    network.ssid = ssid.c_str();
    network.rssi = WiFi.RSSI(index);
    network.encrypted = (WiFi.encryptionType(index) != ENC_TYPE_NONE);
    s_networks.push_back(network);
  }

  WiFi.scanDelete();
  std::sort(s_networks.begin(), s_networks.end(), [](const app::WifiPortalNetwork &lhs,
                                                     const app::WifiPortalNetwork &rhs) {
    return lhs.rssi > rhs.rssi;
  });
}

void sendPortalPage(const String &message, const String &selectedSsid, const String &cityCode)
{
  const std::string apSsid = portalUsesAccessPoint() ? app_config::kWifiPortalApSsid : "";
  const std::string html = app::buildWifiPortalPage(apSsid,
                                                    s_portalIp.toString().c_str(),
                                                    s_networks,
                                                    selectedSsid.c_str(),
                                                    cityCode.c_str(),
                                                    message.c_str());
  s_server.send(200, "text/html", html.c_str());
}

void ensurePortalRoutesConfigured()
{
  if (s_serverRoutesConfigured)
  {
    return;
  }

  s_server.on("/", HTTP_GET, handlePortalRoot);
  s_server.on("/save", HTTP_POST, handlePortalSave);
  s_server.onNotFound(handlePortalRoot);
  s_serverRoutesConfigured = true;
}

void stopPortalServer()
{
  const bool wasApPortal = portalUsesAccessPoint();

  s_server.stop();
  s_dnsServer.stop();
  if (wasApPortal)
  {
    WiFi.softAPdisconnect(true);
  }

  s_portalMode = ConfigPortalMode::None;
  s_portalIp = IPAddress();
}

void startPortalServer(app::AppConfigData &config, ConfigPortalMode mode, const IPAddress &portalIp)
{
  stopPortalServer();
  s_config = &config;
  s_portalRestartRequested = false;
  s_portalMode = mode;
  s_portalIp = portalIp;

  ensurePortalRoutesConfigured();
  if (mode == ConfigPortalMode::AccessPoint)
  {
    s_dnsServer.setErrorReplyCode(DNSReplyCode::NoError);
    s_dnsServer.start(kPortalDnsPort, "*", s_portalIp);
  }
  s_server.begin();

  Serial.printf("[Net] setup portal mode=%s ip=%s\n",
                portalModeName(mode),
                s_portalIp.toString().c_str());
}

void processPortalClients()
{
  if (portalUsesAccessPoint())
  {
    s_dnsServer.processNextRequest();
  }
  s_server.handleClient();
}

void startLanConfigServer(app::AppConfigData &config)
{
  if (WiFi.status() != WL_CONNECTED)
  {
    stopPortalServer();
    s_config = nullptr;
    return;
  }

  const IPAddress localIp = WiFi.localIP();
  if (s_portalMode == ConfigPortalMode::LocalNetwork &&
      s_config == &config &&
      s_portalIp == localIp)
  {
    return;
  }

  scanNearbyNetworks();
  startPortalServer(config, ConfigPortalMode::LocalNetwork, localIp);
}

void handlePortalRoot()
{
  const String ssid = s_config ? String(s_config->wifiSsid.c_str()) : String();
  const String cityCode = (s_config && !s_config->cityCode.empty())
                            ? String(s_config->cityCode.c_str())
                            : String();
  sendPortalPage(String(), ssid, cityCode);
}

void handlePortalSave()
{
  if (!s_config)
  {
    s_server.send(500, "text/plain", "Portal state unavailable");
    return;
  }

  String ssid = s_server.arg("ssid");
  String psk = s_server.arg("psk");
  String cityCodeInput = s_server.arg("CityCode");
  ssid.trim();
  psk.trim();
  cityCodeInput.trim();

  if (ssid.length() == 0)
  {
    sendPortalPage("SSID is required.", ssid, cityCodeInput);
    return;
  }

  const std::string normalizedCityCode = app::normalizeCityCodeInput(cityCodeInput.c_str());
  if (cityCodeInput.length() > 0 && cityCodeInput != "0" && normalizedCityCode.empty())
  {
    sendPortalPage("City code must be 9 digits or 0.", ssid, cityCodeInput);
    return;
  }

  s_config->wifiSsid = ssid.c_str();
  s_config->wifiPsk = psk.c_str();
  s_config->cityCode = normalizedCityCode;
  storage::saveConfig(*s_config);

  s_server.send(
    200,
    "text/html",
    F("<!doctype html><html><body style='font-family:sans-serif;background:#111;color:#eee;padding:16px'>"
      "<h2>Saved</h2><p>Credentials stored. The device will reboot now.</p></body></html>"));
  s_portalRestartRequested = true;
}

void runWebConfig(app::AppConfigData &config)
{
  s_config = &config;
  s_portalRestartRequested = false;

  WiFi.persistent(false);
  WiFi.disconnect(true);
  delay(200);
  WiFi.mode(WIFI_STA);
  scanNearbyNetworks();
  WiFi.mode(WIFI_AP_STA);
  WiFi.softAPdisconnect(true);
  delay(100);
  WiFi.softAP(app_config::kWifiPortalApSsid);
  delay(200);

  startPortalServer(config, ConfigPortalMode::AccessPoint, WiFi.softAPIP());
  drawPortalInstructions();

  while (!s_portalRestartRequested)
  {
    processPortalClients();
    delay(2);
  }

  stopPortalServer();
  s_config = nullptr;
  delay(1200);
  ESP.restart();
}

} // namespace

bool connect(app::AppConfigData &config, app::WifiConnectMode mode)
{
  const bool blockingUi = (mode == app::WifiConnectMode::ForegroundBlocking);

  if (WiFi.status() == WL_CONNECTED)
  {
    config.wifiSsid = WiFi.SSID().c_str();
    config.wifiPsk = WiFi.psk().c_str();
    storage::saveConfig(config);
    display::setRotation(config.lcdRotation);
    display::setBrightness(config.lcdBrightness);
    startLanConfigServer(config);
    return true;
  }

  if (!config.wifiSsid.empty())
  {
    WiFi.mode(WIFI_STA);
    WiFi.begin(config.wifiSsid.c_str(), config.wifiPsk.c_str());

    const uint32_t start = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - start < 12000)
    {
      if (blockingUi)
      {
        display::drawLoading(30, 1);
      }
      else
      {
        delay(30);
      }
    }
  }

  if (WiFi.status() != WL_CONNECTED)
  {
    if (!blockingUi)
    {
      return false;
    }

    runWebConfig(config);
    return false;
  }

  if (blockingUi)
  {
    loadingUntilConnected();
  }

  config.wifiSsid = WiFi.SSID().c_str();
  config.wifiPsk = WiFi.psk().c_str();
  storage::saveConfig(config);
  display::setRotation(config.lcdRotation);
  display::setBrightness(config.lcdBrightness);
  startLanConfigServer(config);
  return true;
}

bool isWifiAwake()
{
  return s_wifiAwake;
}

void tick()
{
  if (s_portalMode == ConfigPortalMode::None)
  {
    return;
  }

  if (s_portalMode == ConfigPortalMode::LocalNetwork && WiFi.status() != WL_CONNECTED)
  {
    stopPortalServer();
    s_config = nullptr;
    return;
  }

  processPortalClients();
  if (!s_portalRestartRequested)
  {
    return;
  }

  stopPortalServer();
  s_config = nullptr;
  delay(1200);
  ESP.restart();
}

void sleep()
{
  if (app_config::kKeepWifiAwake)
  {
    s_wifiAwake = true;
    return;
  }
  stopPortalServer();
  s_config = nullptr;
  WiFi.forceSleepBegin();
  s_wifiAwake = false;
}

void wake()
{
  if (app_config::kKeepWifiAwake)
  {
    s_wifiAwake = true;
    return;
  }
  WiFi.forceSleepWake();
  s_wifiAwake = true;
  delay(1);
}

void restart()
{
  stopPortalServer();
  s_config = nullptr;
  ESP.restart();
}

void resetAndRestart()
{
  stopPortalServer();
  s_config = nullptr;
  storage::clearWifiCredentials();
  delay(200);
  ESP.restart();
}

} // namespace net
