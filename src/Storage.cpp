#include "Storage.h"

#include <Arduino.h>
#include <EEPROM.h>
#include <string.h>

#include "AppConfig.h"

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

// 从旧布局迁移 (仅在 magic 不存在时调用)
void migrateFromLegacy(AppState &state)
{
  uint8_t bl = EEPROM.read(legacy_layout::kBrightnessAddr);
  if (bl > 0 && bl <= 100)
    state.lcdBrightness = bl;

  uint8_t ro = EEPROM.read(legacy_layout::kRotationAddr);
  if (ro <= 3)
    state.lcdRotation = ro;

  state.dhtEnabled = EEPROM.read(legacy_layout::kDhtEnabledAddr);

  // 城市代码: 5 字节 BCD, 低位在前
  uint64_t cc = 0;
  for (int i = 4; i >= 0; i--)
  {
    cc = cc * 100 + EEPROM.read(legacy_layout::kCityCodeAddr + i);
  }
  if (cc >= 101000000ULL && cc <= 102000000ULL)
  {
    char buf[12];
    snprintf(buf, sizeof(buf), "%llu", (unsigned long long)cc);
    state.cityCode = String(buf);
  }

  // WiFi
  WifiCredentials legacy{};
  uint8_t *p = (uint8_t *)&legacy;
  for (unsigned int i = 0; i < sizeof(WifiCredentials); i++)
  {
    p[i] = EEPROM.read(legacy_layout::kWifiAddr + i);
  }
  // 简单校验
  if (legacy.ssid[0] != 0 && (uint8_t)legacy.ssid[0] != 0xFF)
  {
    memcpy(&state.wifi, &legacy, sizeof(WifiCredentials));
  }

  Serial.println(F("[Storage] migrated from legacy layout"));
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
    Serial.println(F("[Storage] loaded (new layout)"));
    return true;
  }

  // 尝试旧布局迁移
  migrateFromLegacy(state);
  save(state);
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
  if (cfg.magic != kMagic)
  {
    // 没初始化, 先建一份默认
    memset(&cfg, 0, sizeof(cfg));
    cfg.magic = kMagic;
    cfg.version = kVersion;
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
