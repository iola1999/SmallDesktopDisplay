#ifndef STORAGE_H
#define STORAGE_H

#include "app/AppConfigData.h"

#include <stdint.h>

// ============================================================
// EEPROM 持久化
// 固定使用当前布局; 旧布局和迁移逻辑已移除
// ============================================================

namespace storage
{

struct PersistedConfig
{
  uint16_t magic;   // 0x5344 'SD'
  uint8_t version;  // 当前 1
  uint8_t reserved; // 对齐

  uint8_t brightness;
  uint8_t rotation;
  uint8_t reserved1;
  uint8_t reserved2;

  uint32_t weatherUpdateMinutes;
  char cityCode[10]; // 9 字节 + NUL

  char wifiSsid[32];
  char wifiPsk[64];
};

constexpr uint16_t kMagic = 0x5344;
constexpr uint8_t kVersion = 1;
constexpr size_t kEepromSize = 1024;

void begin();
bool loadConfig(app::AppConfigData &config);
void saveConfig(const app::AppConfigData &config);
void clearWifiCredentials();

} // namespace storage

#endif // STORAGE_H
