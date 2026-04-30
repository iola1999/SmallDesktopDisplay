#include "Storage.h"

#include <Arduino.h>
#include <EEPROM.h>
#include <string.h>

namespace storage
{

namespace
{

void copyString(char *dest, size_t size, const std::string &value)
{
  if (size == 0)
    return;
  strncpy(dest, value.c_str(), size - 1);
  dest[size - 1] = '\0';
}

void pack(const app::AppConfigData &config, PersistedConfig &cfg)
{
  memset(&cfg, 0, sizeof(cfg));
  cfg.magic = kMagic;
  cfg.version = kVersion;
  cfg.brightness = config.lcdBrightness;
  cfg.rotation = config.lcdRotation;
  copyString(cfg.wifiSsid, sizeof(cfg.wifiSsid), config.wifiSsid);
  copyString(cfg.wifiPsk, sizeof(cfg.wifiPsk), config.wifiPsk);
  copyString(cfg.remoteBaseUrl, sizeof(cfg.remoteBaseUrl), config.remoteBaseUrl);
  copyString(cfg.remoteDeviceId, sizeof(cfg.remoteDeviceId), config.remoteDeviceId);
}

void unpack(const PersistedConfig &cfg, app::AppConfigData &config)
{
  config.lcdBrightness = cfg.brightness;
  config.lcdRotation = cfg.rotation;
  config.wifiSsid = cfg.wifiSsid;
  config.wifiPsk = cfg.wifiPsk;
  config.remoteBaseUrl = cfg.remoteBaseUrl;
  config.remoteDeviceId = cfg.remoteDeviceId;
  if (config.remoteBaseUrl.empty())
  {
    config.remoteBaseUrl = app_config::kDefaultRemoteRenderBaseUrl;
  }
  if (config.remoteDeviceId.empty())
  {
    config.remoteDeviceId = app_config::kDefaultRemoteDeviceId;
  }
}

void writeBlob(const void *buf, size_t len)
{
  const uint8_t *p = (const uint8_t *)buf;
  for (size_t i = 0; i < len; i++)
  {
    EEPROM.write(i, p[i]);
  }
  EEPROM.commit();
}

void readBlob(void *buf, size_t len)
{
  uint8_t *p = (uint8_t *)buf;
  for (size_t i = 0; i < len; i++)
  {
    p[i] = EEPROM.read(i);
  }
}

} // namespace

void begin()
{
  EEPROM.begin(kEepromSize);
}

bool loadConfig(app::AppConfigData &config)
{
  PersistedConfig cfg;
  readBlob(&cfg, sizeof(cfg));
  if (cfg.magic == kMagic && cfg.version == kVersion)
  {
    unpack(cfg, config);
    Serial.println(F("[Storage] loaded"));
    return true;
  }

  config = app::AppConfigData{};
  saveConfig(config);
  Serial.println(F("[Storage] invalid config, reset to defaults"));
  return false;
}

void saveConfig(const app::AppConfigData &config)
{
  PersistedConfig cfg;
  pack(config, cfg);
  writeBlob(&cfg, sizeof(cfg));
}

void clearWifiCredentials()
{
  app::AppConfigData config;
  loadConfig(config);
  config.wifiSsid.clear();
  config.wifiPsk.clear();
  saveConfig(config);
}

} // namespace storage
