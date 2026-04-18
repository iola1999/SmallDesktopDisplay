#ifndef SCREEN_H
#define SCREEN_H

#include <WString.h>
#include <stdint.h>

// ============================================================
// 高层 UI 面板 (使用 display + AppState 渲染)
// ============================================================

namespace screen
{

// 时钟 / 日期
void refreshClock();          // 脏位更新, 供线程定时调用
void forceClockRedraw();      // 强制全刷 (切换方向后)

// 天气主区域: 温度/湿度/城市/空气质量/天气图标
void drawWeatherMain(const String &tempText, int tempValue,
                     const String &humidityText, int humidityRaw,
                     const String &cityName,
                     int aqi,
                     int weatherCode);

// 横幅文字
void refreshBanner();         // 轮播 g_app.bannerText

// 温/湿度进度条
void drawTempBar();
void drawHumidityBar();

// 室内温湿度 (DHT)
void drawIndoorTemp(float tempC, float humidityPct);

// Web 配网失败提示
void drawConfigFailed();

// 天气获取失败提示
void drawWeatherError(const char *reason);

} // namespace screen

#endif // SCREEN_H
