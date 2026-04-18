#include "Storage.h"

#include <Arduino.h>
#include <EEPROM.h>
#include <string.h>

namespace storage
{

namespace
{

// 把 state 打包进 PersistedConfig
void pack(const AppState &state, PersistedConfig &cfg)
{
  memset(&cfg, 0, sizeof(cfg));
  cfg.magic = kMagic;
  cfg.version = kVersion;
  cfg.brightness = state.lcdBrightness;
  cfg.rotation = state.lcdRotation;
  cfg.dhtEnabled = state.dhtEnabled;
  cfg.weatherUpdateMinutes = state.weatherUpdateMinutes;
  strncpy(cfg.cityCode, state.cityCode.c_str(), sizeof(cfg.cityCode) - 1);
  memcpy(&cfg.wifi, &state.wifi, sizeof(WifiCredentials));
}

void unpack(const PersistedConfig &cfg, AppState &state)
{
  state.lcdBrightness = cfg.brightness;
  state.lcdRotation = cfg.rotation;
  state.dhtEnabled = cfg.dhtEnabled;
  state.weatherUpdateMinutes = cfg.weatherUpdateMinutes;
  state.cityCode = String(cfg.cityCode);
  memcpy(&state.wifi, &cfg.wifi, sizeof(WifiCredentials));
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

bool load(AppState &state)
{
  PersistedConfig cfg;
  readBlob(&cfg, sizeof(cfg));
  if (cfg.magic == kMagic && cfg.version == kVersion)
  {
    unpack(cfg, state);
    Serial.println(F("[Storage] loaded"));
    return true;
  }

  state = AppState{};
  save(state);
  Serial.println(F("[Storage] invalid config, reset to defaults"));
  return false;
}

void save(const AppState &state)
{
  PersistedConfig cfg;
  pack(state, cfg);
  writeBlob(&cfg, sizeof(cfg));
}

void saveWifi(const WifiCredentials &wifi)
{
  PersistedConfig cfg;
  readBlob(&cfg, sizeof(cfg));
  if (cfg.magic != kMagic || cfg.version != kVersion)
  {
    AppState defaults;
    pack(defaults, cfg);
  }
  memcpy(&cfg.wifi, &wifi, sizeof(WifiCredentials));
  writeBlob(&cfg, sizeof(cfg));
}

void clearWifi()
{
  WifiCredentials empty{};
  saveWifi(empty);
}

} // namespace storage
