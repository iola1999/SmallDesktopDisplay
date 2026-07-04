#ifndef APP_CONFIG_H
#define APP_CONFIG_H

#include <stddef.h>
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
// 长轮询停靠时长：必须略大于服务端动画帧间隔（50ms@20fps）。
// 旧值 10ms 会让排空后的下一次轮询赶在新帧渲染前返回 204，再叠加 50ms
// 节流，翻牌动画实际只有 ~12-16fps 且间隔抖动；80ms 让请求正好停靠到
// 下一帧出炉。按键最坏多 80ms 延迟，仍远小于 250ms 双击窗口。
constexpr uint32_t kRemoteFrameWaitMs = 80;
// 命令拉取的最小间隔。命令通道已改为由帧响应的 X-SDD-Cmd 头驱动
// （有新命令才真正发起 GET），这里只作为异常情况下的节流下限。
constexpr uint32_t kRemoteCommandPollMs = 100;
constexpr uint32_t kRemoteStatusSyncMs = 10000;
constexpr uint32_t kRemoteHttpTimeoutMs = 5000;

// 串口直连（USB-serial 到渲染服务宿主机）。
// 921600 在 ESP8266（80MHz 分频误差 0.2%）与 CH340/CP2102 上都稳妥；
// 帧均值 <20KB/s，92KB/s 带宽富余。想更快可两侧同步改大后实测。
constexpr uint32_t kSerialBaud = 921600;
// UART RX 环形缓冲：吸收绘屏批次期间到达的字节（停等协议下积压 ≤1 帧头部）。
constexpr size_t kSerialRxBufferBytes = 4096;
// 开机串口探测窗口：发出 HELLO 后等待宿主机下行的时长，超时降级 WiFi。
constexpr uint32_t kSerialDetectWindowMs = 1500;
// 串口模式下行静默判定：首页每秒必有帧，静默说明链路断开。
constexpr uint32_t kSerialLinkIdleMs = 10000;
// 链路疑似断开后的 HELLO 补发间隔与次数，全部无回应才降级 WiFi。
constexpr uint32_t kSerialProbeIntervalMs = 2000;
constexpr uint8_t kSerialProbeAttempts = 3;
// 串口整帧读取的分段超时（同 HTTP 的 lastProgress 语义，串口链路更短）。
constexpr uint32_t kSerialReadTimeoutMs = 2000;

} // namespace app_config

#endif // APP_CONFIG_H
