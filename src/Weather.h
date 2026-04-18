#ifndef WEATHER_H
#define WEATHER_H

#include <WString.h>

// ============================================================
// 天气数据拉取 + 解析 + 调用 Screen 绘制
// ============================================================

namespace weather
{

bool fetchCityCode(String &outCode); // 从 wgeo.weather.com.cn 解析 IP -> 城市代码
bool fetchAndRender();               // 拉城市天气并驱动 Screen 绘制 (带重试)

} // namespace weather

#endif // WEATHER_H
