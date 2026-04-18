#ifndef WEATHERNUM_H
#define WEATHERNUM_H

// 显示天气图标，numw 为天气 code（来自天气 JSON 的 weathercode 字段后两位）
class WeatherNum
{
public:
  void printfweather(int numx, int numy, int numw);
};

#endif
