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
// 双击窗口同时决定：单击上报延迟（Button2 要等窗口关闭才能确认单击）和长按进度条的
// 出现时刻（延迟 = 窗口，避免每次单击都闪进度条）。250ms 让单击更跟手、进度条更早出现。
constexpr uint32_t kButtonDoubleClickMs = 250;
// 450ms 触发长按：进度条从 250ms 画到 450ms（配合按住期间暂停轮询，全帧率填充）。
constexpr uint32_t kButtonLongPressMs = 450;
constexpr uint32_t kHoldProgressDelayMs = kButtonDoubleClickMs;
constexpr const char *kWifiPortalApSsid = "SDD-Setup";

constexpr uint16_t kColorBg = 0x0000;

// 远程渲染
constexpr uint32_t kRemoteFramePollMs = 50;
constexpr uint32_t kRemoteFrameWaitMs = 10;
constexpr uint32_t kRemoteCommandPollMs = 100;
constexpr uint32_t kRemoteStatusSyncMs = 10000;
constexpr uint32_t kRemoteHttpTimeoutMs = 5000;

} // namespace app_config

#endif // APP_CONFIG_H
