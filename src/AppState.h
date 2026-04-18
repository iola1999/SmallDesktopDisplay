#ifndef APP_STATE_H
#define APP_STATE_H

#include <stdint.h>
#include <WString.h>

// ============================================================
// 运行时状态 (由 main.cpp 定义唯一实例, 其它模块 extern 访问)
// ============================================================

struct WifiCredentials
{
  char ssid[32]; // 最大 32 字节
  char psk[64];  // 最大 64 字节
};

struct AppState
{
  // 用户可配置
  WifiCredentials wifi{}; // 默认空; 首次启动会进入配网
  String cityCode = "101090609";
  uint32_t weatherUpdateMinutes = 1;
  uint8_t lcdBrightness = 50; // 0-100
  uint8_t lcdRotation = 0;    // 0-3
  uint8_t dhtEnabled = 0;     // 运行时 flag

  // 运行时状态
  bool wifiAwake = true;
  bool weatherDirty = false;

  // 天气读数缓存 (用于进度条)
  int tempPercent = 0;
  int humidityPercent = 0;
  uint16_t tempColor = 0xFFFF;
  uint16_t humidityColor = 0xFFFF;

  // 滚动横幅
  String bannerText[7];
  int bannerIndex = 0;

  // 时钟脏位缓存
  int lastHour = -1;
  int lastMinute = -1;
  int lastSecond = -1;
};

extern AppState g_app;

#endif // APP_STATE_H
