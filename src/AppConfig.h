#ifndef APP_CONFIG_H
#define APP_CONFIG_H

#include <stdint.h>

// ============================================================
// 功能开关 (保持 #define 以便 #if 条件编译)
// ============================================================
#define WM_EN 1          // 1: WiFiManager Web 配网; 0: SmartConfig (两者互斥)
#define DHT_EN 0         // 1: 启用 DHT11 温湿度传感器 (GPIO12)
#define ANIMATE_CHOICE 2 // 右下角动图: 0 关闭 / 1 太空人 / 2 胡桃

// 兼容旧名
#define Animate_Choice ANIMATE_CHOICE

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
constexpr const char *kDefaultCityCode = "101090609";

// 引脚
constexpr uint8_t kPinLcdBacklight = 5;  // LCD 背光
constexpr uint8_t kPinButton = 4;        // 按键
constexpr uint8_t kPinDht = 12;          // DHT11

// UI 坐标 / 尺寸
constexpr uint16_t kTimeY = 82; // 时钟字体 y 坐标

// 颜色 (RGB565)
constexpr uint16_t kColorFontYellow = 0xD404;
constexpr uint16_t kColorFontWhite = 0xFFFF;
constexpr uint16_t kColorBg = 0x0000;

// 线程 tick 间隔
constexpr uint32_t kClockRefreshMs = 300;
constexpr uint32_t kBannerRefreshMs = 2 * kTickMs;
constexpr uint32_t kAnimateRefreshMs = kTickMs / 10;
constexpr uint32_t kAnimateFrameIntervalMs = 100;

// 天气 HTTP
constexpr uint32_t kWeatherHttpTimeoutMs = 5000;
constexpr uint8_t  kWeatherMaxRetries = 2;

} // namespace app_config

// ============================================================
// 兼容旧宏 (可逐步移除)
// ============================================================
#define TMS              app_config::kTickMs
#define timeY            app_config::kTimeY
#define SD_FONT_YELLOW   app_config::kColorFontYellow
#define SD_FONT_WHITE    app_config::kColorFontWhite

#endif // APP_CONFIG_H
