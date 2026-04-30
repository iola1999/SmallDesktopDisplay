#ifndef APP_CONFIG_H
#define APP_CONFIG_H

#include <stdint.h>

// ============================================================
// 编译期常量
// ============================================================
namespace app_config
{

constexpr const char *kVersion = "SDD V1.5.0";

// 默认值 (EEPROM 未初始化时使用)
constexpr uint8_t kDefaultLcdBrightness = 50; // 0-100
constexpr uint8_t kDefaultLcdRotation = 0;    // 0-3
constexpr const char *kDefaultRemoteRenderBaseUrl = "http://192.168.1.7:18080";
constexpr const char *kDefaultRemoteDeviceId = "desk-01";

// 引脚
constexpr uint8_t kPinLcdBacklight = 5; // LCD 背光
constexpr uint8_t kPinButton = 4;       // 按键
constexpr bool kKeepWifiAwake = true;
constexpr uint32_t kButtonDoubleClickMs = 300;
constexpr uint32_t kButtonLongPressMs = 500;
constexpr uint32_t kHoldProgressDelayMs = kButtonDoubleClickMs;
constexpr const char *kWifiPortalApSsid = "SDD-Setup";

constexpr uint16_t kColorBg = 0x0000;

// 远程渲染
constexpr uint32_t kRemoteFramePollMs = 50;
constexpr uint32_t kRemoteFrameWaitMs = 10;
constexpr uint32_t kRemoteCommandPollMs = 100;
constexpr uint32_t kRemoteHttpTimeoutMs = 5000;

} // namespace app_config

#endif // APP_CONFIG_H
