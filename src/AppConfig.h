#ifndef APP_CONFIG_H
#define APP_CONFIG_H

#include <stdint.h>

// ============================================================
// 功能开关 (保持 #define 以便 #if 条件编译)
// ============================================================

// ============================================================
// 编译期常量
// ============================================================
namespace app_config
{

constexpr const char *kVersion = "SDD V1.5.0";

// 时间
constexpr uint32_t kTickMs = 1000;          // 一秒的毫秒数
constexpr int      kTimeZoneOffsetHours = 8; // 东八区
constexpr const char *kNtpServer = "ntp6.aliyun.com";
constexpr uint16_t kUdpLocalPort = 8000;
constexpr uint32_t kNtpSyncIntervalSec = 300;

// 默认值 (EEPROM 未初始化时使用)
constexpr uint8_t  kDefaultLcdBrightness = 50;     // 0-100
constexpr uint8_t  kDefaultLcdRotation = 0;        // 0-3
constexpr uint32_t kDefaultWeatherUpdateMinutes = 1;
constexpr const char *kDefaultCityCode = "101210102";
constexpr uint32_t kEsp8266RamTotalBytes = 80 * 1024;

// 引脚
constexpr uint8_t kPinLcdBacklight = 5;  // LCD 背光
constexpr uint8_t kPinButton = 4;        // 按键
constexpr bool kKeepWifiAwake = true;
constexpr uint32_t kButtonDoubleClickMs = 300;
constexpr uint32_t kButtonLongPressMs = 500;
constexpr uint32_t kHoldFeedbackDelayMs = kButtonDoubleClickMs;
constexpr uint32_t kGestureFeedbackDurationMs = 420;
constexpr uint32_t kHoldFeedbackRefreshMs = 16;
constexpr uint32_t kUiMotionTickMs = 16;
constexpr const char *kWifiPortalApSsid = "SDD-Setup";

// UI 坐标 / 尺寸
constexpr uint16_t kTimeY = 82; // 时钟字体 y 坐标
constexpr uint8_t  kBannerSlotCount = 6;

// 颜色 (RGB565)
constexpr uint16_t kColorFontYellow = 0xD404;
constexpr uint16_t kColorFontWhite = 0xFFFF;
constexpr uint16_t kColorBg = 0x0000;

// 线程 tick 间隔
constexpr uint32_t kClockRefreshMs = 300;
constexpr uint32_t kBannerRefreshMs = 2 * kTickMs;
constexpr uint32_t kAnimateRefreshMs = kTickMs / 10;
constexpr uint32_t kAnimateFrameIntervalMs = 100;
constexpr uint32_t kDiagnosticsRefreshMs = kTickMs;

// 天气 HTTP
constexpr bool     kWeatherFetchEnabled = true;
constexpr uint32_t kWeatherHttpTimeoutMs = 5000;
constexpr uint8_t  kWeatherMaxRetries = 2;
constexpr uint32_t kStartupWeatherDelaySec = 5;
constexpr uint32_t kPostTimeSyncWeatherDelaySec = 2;

} // namespace app_config

#endif // APP_CONFIG_H
