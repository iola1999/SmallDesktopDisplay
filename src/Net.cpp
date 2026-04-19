#include "Net.h"

#include <Arduino.h>
#include <DNSServer.h>
#include <ESP8266WebServer.h>
#include <ESP8266WiFi.h>

#include "Display.h"
#include "Storage.h"

namespace net
{

namespace
{

constexpr uint16_t kPortalDnsPort = 53;

bool s_wifiAwake = true;
app::AppConfigData *s_config = nullptr;
DNSServer s_dnsServer;
ESP8266WebServer s_server(80);
IPAddress s_portalIp;
bool s_portalRestartRequested = false;

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
  display::tft.drawString("Save credentials to reboot", 120, 220, 2);
}

String portalPage(const String &message)
{
  String html;
  html.reserve(900);
  html += F(
    "<!doctype html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'>"
    "<title>SmallDesktopDisplay WiFi Setup</title></head>"
    "<body style='font-family:sans-serif;background:#111;color:#eee;padding:16px'>"
    "<h2>SmallDesktopDisplay WiFi Setup</h2>"
    "<p>Connect to AP <b>");
  html += app_config::kWifiPortalApSsid;
  html += F("</b> and open <b>");
  html += s_portalIp.toString();
  html += F(
    "</b>.</p>"
    "<form method='post' action='/save'>"
    "<p><label>SSID<br><input name='ssid' maxlength='31' style='width:100%;padding:10px'></label></p>"
    "<p><label>Password<br><input name='psk' type='password' maxlength='63' style='width:100%;padding:10px'></label></p>"
    "<p><button type='submit' style='padding:10px 14px'>Save and Restart</button></p>");
  if (message.length() > 0)
  {
    html += F("<p><b>");
    html += message;
    html += F("</b></p>");
  }
  html += F("</form></body></html>");
  return html;
}

void sendPortalPage(const String &message)
{
  s_server.send(200, "text/html", portalPage(message));
}

void handlePortalRoot()
{
  sendPortalPage(String());
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
  ssid.trim();
  psk.trim();

  if (ssid.length() == 0)
  {
    sendPortalPage("SSID is required.");
    return;
  }

  s_config->wifiSsid = ssid.c_str();
  s_config->wifiPsk = psk.c_str();
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
  WiFi.mode(WIFI_AP);
  WiFi.softAPdisconnect(true);
  delay(100);
  WiFi.softAP(app_config::kWifiPortalApSsid);
  delay(200);

  s_portalIp = WiFi.softAPIP();
  drawPortalInstructions();
  Serial.printf("[Net] setup portal AP=%s ip=%s\n",
                app_config::kWifiPortalApSsid,
                s_portalIp.toString().c_str());

  s_dnsServer.setErrorReplyCode(DNSReplyCode::NoError);
  s_dnsServer.start(kPortalDnsPort, "*", s_portalIp);
  s_server.on("/", HTTP_GET, handlePortalRoot);
  s_server.on("/save", HTTP_POST, handlePortalSave);
  s_server.onNotFound(handlePortalRoot);
  s_server.begin();

  while (!s_portalRestartRequested)
  {
    s_dnsServer.processNextRequest();
    s_server.handleClient();
    delay(2);
  }

  s_server.stop();
  s_dnsServer.stop();
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
  return true;
}

bool isWifiAwake()
{
  return s_wifiAwake;
}

void sleep()
{
  if (app_config::kKeepWifiAwake)
  {
    s_wifiAwake = true;
    return;
  }
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
  ESP.restart();
}

void resetAndRestart()
{
  storage::clearWifiCredentials();
  delay(200);
  ESP.restart();
}

} // namespace net
