#ifndef STORAGE_H
#define STORAGE_H

#include <stdint.h>
#include "AppState.h"

// ============================================================
// EEPROM 持久化
// 统一使用 struct + magic + version 读写, 同时向后兼容旧手写布局
// ============================================================

namespace storage
{

// 旧布局偏移 (仅用于首次迁移)
namespace legacy_layout
{
constexpr int kBrightnessAddr = 1;
constexpr int kRotationAddr = 2;
constexpr int kDhtEnabledAddr = 3;
constexpr int kCityCodeAddr = 10; // 5 字节 BCD
constexpr int kWifiAddr = 30;     // sizeof(WifiCredentials) = 96
} // namespace legacy_layout

// 新布局: 从 0 开始连续写入带 magic 的结构体
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
bool load(AppState &state);   // 读取, 若无 magic 则尝试旧布局
void save(const AppState &state);
void saveWifi(const WifiCredentials &wifi);
void clearWifi();

} // namespace storage

#endif // STORAGE_H
