#ifndef STORAGE_H
#define STORAGE_H

#include "AppState.h"

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
  uint8_t dhtEnabled;
  uint8_t reserved2;

  uint32_t weatherUpdateMinutes;
  char cityCode[10]; // 9 字节 + NUL

  WifiCredentials wifi;
};

constexpr uint16_t kMagic = 0x5344;
constexpr uint8_t kVersion = 1;
constexpr size_t kEepromSize = 1024;

void begin();                 // EEPROM.begin(kEepromSize)
bool load(AppState &state);   // 读取, 无效配置时回退到默认值并重写
void save(const AppState &state);
void saveWifi(const WifiCredentials &wifi);
void clearWifi();

} // namespace storage

#endif // STORAGE_H
