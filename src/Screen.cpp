#include "Screen.h"

#include <Arduino.h>
#include <TJpg_Decoder.h>
#include <TimeLib.h>

#include "AppConfig.h"
#include "AppState.h"
#include "Display.h"
#include "font/ZdyLwFont_20.h"
#include "font/timeClockFont.h"
#include "weatherNum/weatherNum.h"

namespace screen
{

namespace
{

WeatherNum s_weather;

String weekText()
{
  const char *wk[7] = {"日", "一", "二", "三", "四", "五", "六"};
  return String("周") + wk[weekday() - 1];
}

String monthDayText()
{
  return String(month()) + "月" + day() + "日";
}

// 快速线方式绘制数字字体
void drawLineFont(uint32_t x, uint32_t y, uint32_t num, uint32_t size, uint32_t color)
{
  uint32_t fontSize;
  const LineAtom *fontOne;

  if (size == 1)
  {
    fontOne = smallLineFont[num];
    fontSize = smallLineFont_size[num];
    display::tft.fillRect(x, y, 9, 14, TFT_BLACK);
  }
  else if (size == 2)
  {
    fontOne = middleLineFont[num];
    fontSize = middleLineFont_size[num];
    display::tft.fillRect(x, y, 18, 30, TFT_BLACK);
  }
  else if (size == 3)
  {
    fontOne = largeLineFont[num];
    fontSize = largeLineFont_size[num];
    display::tft.fillRect(x, y, 36, 90, TFT_BLACK);
  }
  else
  {
    return;
  }

  for (uint32_t i = 0; i < fontSize; i++)
  {
    display::tft.drawFastHLine(fontOne[i].xValue + x, fontOne[i].yValue + y, fontOne[i].lValue, color);
  }
}

void drawClockDigits(bool force)
{
  int h = hour(), m = minute(), s = second();

  if (h != g_app.lastHour || force)
  {
    drawLineFont(20, app_config::kTimeY, h / 10, 3, app_config::kColorFontWhite);
    drawLineFont(60, app_config::kTimeY, h % 10, 3, app_config::kColorFontWhite);
    g_app.lastHour = h;
  }
  if (m != g_app.lastMinute || force)
  {
    drawLineFont(101, app_config::kTimeY, m / 10, 3, app_config::kColorFontYellow);
    drawLineFont(141, app_config::kTimeY, m % 10, 3, app_config::kColorFontYellow);
    g_app.lastMinute = m;
  }
  if (s != g_app.lastSecond || force)
  {
    drawLineFont(182, app_config::kTimeY + 30, s / 10, 2, app_config::kColorFontWhite);
    drawLineFont(202, app_config::kTimeY + 30, s % 10, 2, app_config::kColorFontWhite);
    g_app.lastSecond = s;
  }
}

void drawDate()
{
  display::clk.setColorDepth(8);
  display::clk.loadFont(ZdyLwFont_20);

  display::clk.createSprite(58, 30);
  display::clk.fillSprite(app_config::kColorBg);
  display::clk.setTextDatum(CC_DATUM);
  display::clk.setTextColor(TFT_WHITE, app_config::kColorBg);
  display::clk.drawString(weekText(), 29, 16);
  display::clk.pushSprite(102, 150);
  display::clk.deleteSprite();

  display::clk.createSprite(95, 30);
  display::clk.fillSprite(app_config::kColorBg);
  display::clk.setTextDatum(CC_DATUM);
  display::clk.setTextColor(TFT_WHITE, app_config::kColorBg);
  display::clk.drawString(monthDayText(), 49, 16);
  display::clk.pushSprite(5, 150);
  display::clk.deleteSprite();

  display::clk.unloadFont();
}

} // namespace

void refreshClock()
{
  drawClockDigits(false);
  drawDate();
}

void forceClockRedraw()
{
  g_app.lastHour = -1;
  g_app.lastMinute = -1;
  g_app.lastSecond = -1;
  drawClockDigits(true);
  drawDate();
}

void drawTempBar()
{
  display::clk.setColorDepth(8);
  display::clk.createSprite(52, 6);
  display::clk.fillSprite(app_config::kColorBg);
  display::clk.drawRoundRect(0, 0, 52, 6, 3, 0xFFFF);
  display::clk.fillRoundRect(1, 1, g_app.tempPercent, 4, 2, g_app.tempColor);
  display::clk.pushSprite(45, 192);
  display::clk.deleteSprite();
}

void drawHumidityBar()
{
  int halfBar = g_app.humidityPercent / 2;
  display::clk.setColorDepth(8);
  display::clk.createSprite(52, 6);
  display::clk.fillSprite(app_config::kColorBg);
  display::clk.drawRoundRect(0, 0, 52, 6, 3, 0xFFFF);
  display::clk.fillRoundRect(1, 1, halfBar, 4, 2, g_app.humidityColor);
  display::clk.pushSprite(45, 222);
  display::clk.deleteSprite();
}

void drawWeatherMain(const String &tempText, int tempValue,
                     const String &humidityText, int humidityRaw,
                     const String &cityName,
                     int aqi,
                     int weatherCode)
{
  display::clk.setColorDepth(8);
  display::clk.loadFont(ZdyLwFont_20);

  // 温度
  display::clk.createSprite(58, 24);
  display::clk.fillSprite(app_config::kColorBg);
  display::clk.setTextDatum(CC_DATUM);
  display::clk.setTextColor(TFT_WHITE, app_config::kColorBg);
  display::clk.drawString(tempText + "℃", 28, 13);
  display::clk.pushSprite(100, 184);
  display::clk.deleteSprite();

  int t = tempValue + 10;
  if (t < 10)
    g_app.tempColor = 0x00FF;
  else if (t < 28)
    g_app.tempColor = 0x0AFF;
  else if (t < 34)
    g_app.tempColor = 0x0F0F;
  else if (t < 41)
    g_app.tempColor = 0xFF0F;
  else if (t < 49)
    g_app.tempColor = 0xF00F;
  else
  {
    g_app.tempColor = 0xF00F;
    t = 50;
  }
  g_app.tempPercent = t;
  drawTempBar();

  // 湿度
  display::clk.createSprite(58, 24);
  display::clk.fillSprite(app_config::kColorBg);
  display::clk.setTextDatum(CC_DATUM);
  display::clk.setTextColor(TFT_WHITE, app_config::kColorBg);
  display::clk.drawString(humidityText, 28, 13);
  display::clk.pushSprite(100, 214);
  display::clk.deleteSprite();

  g_app.humidityPercent = humidityRaw;
  if (humidityRaw > 90)
    g_app.humidityColor = 0x00FF;
  else if (humidityRaw > 70)
    g_app.humidityColor = 0x0AFF;
  else if (humidityRaw > 40)
    g_app.humidityColor = 0x0F0F;
  else if (humidityRaw > 20)
    g_app.humidityColor = 0xFF0F;
  else
    g_app.humidityColor = 0xF00F;
  drawHumidityBar();

  // 城市
  display::clk.createSprite(94, 30);
  display::clk.fillSprite(app_config::kColorBg);
  display::clk.setTextDatum(CC_DATUM);
  display::clk.setTextColor(TFT_WHITE, app_config::kColorBg);
  display::clk.drawString(cityName, 44, 16);
  display::clk.pushSprite(15, 15);
  display::clk.deleteSprite();

  // AQI
  uint16_t aqiBg = display::tft.color565(156, 202, 127);
  const char *aqiText = "优";
  if (aqi > 200)
  {
    aqiBg = display::tft.color565(136, 11, 32);
    aqiText = "重度";
  }
  else if (aqi > 150)
  {
    aqiBg = display::tft.color565(186, 55, 121);
    aqiText = "中度";
  }
  else if (aqi > 100)
  {
    aqiBg = display::tft.color565(242, 159, 57);
    aqiText = "轻度";
  }
  else if (aqi > 50)
  {
    aqiBg = display::tft.color565(247, 219, 100);
    aqiText = "良";
  }
  display::clk.createSprite(56, 24);
  display::clk.fillSprite(app_config::kColorBg);
  display::clk.fillRoundRect(0, 0, 50, 24, 4, aqiBg);
  display::clk.setTextDatum(CC_DATUM);
  display::clk.setTextColor(0x0000);
  display::clk.drawString(aqiText, 25, 13);
  display::clk.pushSprite(104, 18);
  display::clk.deleteSprite();

  display::clk.unloadFont();

  // 天气图标
  s_weather.printfweather(170, 15, weatherCode);
}

void refreshBanner()
{
  const String &text = g_app.bannerText[g_app.bannerIndex];
  if (text.length() == 0)
    return;

  display::clk.setColorDepth(8);
  display::clk.loadFont(ZdyLwFont_20);
  display::clk.createSprite(150, 30);
  display::clk.fillSprite(app_config::kColorBg);
  display::clk.setTextWrap(false);
  display::clk.setTextDatum(CC_DATUM);
  display::clk.setTextColor(TFT_WHITE, app_config::kColorBg);
  display::clk.drawString(text, 74, 16);
  display::clk.pushSprite(10, 45);
  display::clk.deleteSprite();
  display::clk.unloadFont();

  g_app.bannerIndex = (g_app.bannerIndex + 1) % 6;
}

void drawIndoorTemp(float tempC, float humidityPct)
{
  display::clk.setColorDepth(8);
  display::clk.loadFont(ZdyLwFont_20);

  display::clk.createSprite(58, 30);
  display::clk.fillSprite(app_config::kColorBg);
  display::clk.setTextDatum(CC_DATUM);
  display::clk.setTextColor(TFT_WHITE, app_config::kColorBg);
  display::clk.drawString("内温", 29, 16);
  display::clk.pushSprite(172, 150);
  display::clk.deleteSprite();

  display::clk.createSprite(60, 24);
  display::clk.fillSprite(app_config::kColorBg);
  display::clk.setTextDatum(CC_DATUM);
  display::clk.setTextColor(TFT_WHITE, app_config::kColorBg);
  display::clk.drawFloat(tempC, 1, 20, 13);
  display::clk.drawString("℃", 50, 13);
  display::clk.pushSprite(170, 184);
  display::clk.deleteSprite();

  display::clk.createSprite(60, 24);
  display::clk.fillSprite(app_config::kColorBg);
  display::clk.setTextDatum(CC_DATUM);
  display::clk.setTextColor(TFT_WHITE, app_config::kColorBg);
  display::clk.drawFloat(humidityPct, 1, 20, 13);
  display::clk.drawString("%", 50, 13);
  display::clk.pushSprite(170, 214);
  display::clk.deleteSprite();

  display::clk.unloadFont();
}

void drawConfigFailed()
{
  display::clk.setColorDepth(8);
  display::clk.createSprite(200, 60);
  display::clk.fillSprite(app_config::kColorBg);
  display::clk.setTextDatum(CC_DATUM);
  display::clk.setTextColor(TFT_GREEN, app_config::kColorBg);
  display::clk.drawString("WiFi Connect Fail!", 100, 10, 2);
  display::clk.drawString("SSID:", 45, 40, 2);
  display::clk.setTextColor(TFT_WHITE, app_config::kColorBg);
  display::clk.drawString("AutoConnectAP", 125, 40, 2);
  display::clk.pushSprite(20, 50);
  display::clk.deleteSprite();
}

void drawWeatherError(const char *reason)
{
  display::clk.setColorDepth(8);
  display::clk.loadFont(ZdyLwFont_20);
  display::clk.createSprite(150, 30);
  display::clk.fillSprite(app_config::kColorBg);
  display::clk.setTextDatum(CC_DATUM);
  display::clk.setTextColor(TFT_RED, app_config::kColorBg);
  display::clk.drawString(String("天气获取失败: ") + reason, 74, 16);
  display::clk.pushSprite(10, 45);
  display::clk.deleteSprite();
  display::clk.unloadFont();
}

} // namespace screen
