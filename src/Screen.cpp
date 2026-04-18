#include "Screen.h"

#include <Arduino.h>
#include <TJpg_Decoder.h>
#include <TimeLib.h>

#include "AppConfig.h"
#include "Display.h"
#include "font/ZdyLwFont_20.h"
#include "font/timeClockFont.h"
#include "weatherNum/weatherNum.h"

namespace screen
{

namespace
{

WeatherNum s_weather;
std::array<String, app_config::kBannerSlotCount> s_bannerLines{};
int s_bannerIndex = 0;
int s_lastHour = -1;
int s_lastMinute = -1;
int s_lastSecond = -1;
int s_tempPercent = 0;
int s_humidityPercent = 0;
uint16_t s_tempColor = 0xFFFF;
uint16_t s_humidityColor = 0xFFFF;
bool s_mainPageActive = false;

String weekText()
{
  const char *wk[7] = {"日", "一", "二", "三", "四", "五", "六"};
  const int weekIndex = weekday();
  if (weekIndex < 1 || weekIndex > 7)
    return "周-";
  return String("周") + wk[weekIndex - 1];
}

String monthDayText()
{
  return String(month()) + "月" + day() + "日";
}

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

  for (uint32_t index = 0; index < fontSize; ++index)
  {
    display::tft.drawFastHLine(fontOne[index].xValue + x,
                               fontOne[index].yValue + y,
                               fontOne[index].lValue,
                               color);
  }
}

void drawClockDigits(bool force)
{
  const int h = hour();
  const int m = minute();
  const int s = second();

  if (h != s_lastHour || force)
  {
    drawLineFont(20, app_config::kTimeY, h / 10, 3, app_config::kColorFontWhite);
    drawLineFont(60, app_config::kTimeY, h % 10, 3, app_config::kColorFontWhite);
    s_lastHour = h;
  }
  if (m != s_lastMinute || force)
  {
    drawLineFont(101, app_config::kTimeY, m / 10, 3, app_config::kColorFontYellow);
    drawLineFont(141, app_config::kTimeY, m % 10, 3, app_config::kColorFontYellow);
    s_lastMinute = m;
  }
  if (s != s_lastSecond || force)
  {
    drawLineFont(182, app_config::kTimeY + 30, s / 10, 2, app_config::kColorFontWhite);
    drawLineFont(202, app_config::kTimeY + 30, s % 10, 2, app_config::kColorFontWhite);
    s_lastSecond = s;
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

void drawTempBar()
{
  display::clk.setColorDepth(8);
  display::clk.createSprite(52, 6);
  display::clk.fillSprite(app_config::kColorBg);
  display::clk.drawRoundRect(0, 0, 52, 6, 3, 0xFFFF);
  display::clk.fillRoundRect(1, 1, s_tempPercent, 4, 2, s_tempColor);
  display::clk.pushSprite(45, 192);
  display::clk.deleteSprite();
}

void drawHumidityBar()
{
  const int halfBar = s_humidityPercent / 2;
  display::clk.setColorDepth(8);
  display::clk.createSprite(52, 6);
  display::clk.fillSprite(app_config::kColorBg);
  display::clk.drawRoundRect(0, 0, 52, 6, 3, 0xFFFF);
  display::clk.fillRoundRect(1, 1, halfBar, 4, 2, s_humidityColor);
  display::clk.pushSprite(45, 222);
  display::clk.deleteSprite();
}

void updateTemperatureBar(int temperatureC)
{
  int value = temperatureC + 10;
  if (value < 10)
    s_tempColor = 0x00FF;
  else if (value < 28)
    s_tempColor = 0x0AFF;
  else if (value < 34)
    s_tempColor = 0x0F0F;
  else if (value < 41)
    s_tempColor = 0xFF0F;
  else
    s_tempColor = 0xF00F;

  if (value > 50)
    value = 50;
  s_tempPercent = value;
}

void updateHumidityBar(int humidityPercent)
{
  s_humidityPercent = humidityPercent;
  if (humidityPercent > 90)
    s_humidityColor = 0x00FF;
  else if (humidityPercent > 70)
    s_humidityColor = 0x0AFF;
  else if (humidityPercent > 40)
    s_humidityColor = 0x0F0F;
  else if (humidityPercent > 20)
    s_humidityColor = 0xFF0F;
  else
    s_humidityColor = 0xF00F;
}

const char *aqiLabel(int aqi, uint16_t &aqiBg)
{
  aqiBg = display::tft.color565(156, 202, 127);
  if (aqi > 200)
  {
    aqiBg = display::tft.color565(136, 11, 32);
    return "重度";
  }
  if (aqi > 150)
  {
    aqiBg = display::tft.color565(186, 55, 121);
    return "中度";
  }
  if (aqi > 100)
  {
    aqiBg = display::tft.color565(242, 159, 57);
    return "轻度";
  }
  if (aqi > 50)
  {
    aqiBg = display::tft.color565(247, 219, 100);
    return "良";
  }
  return "优";
}

void drawWeatherMain(const app::MainViewData &view)
{
  display::clk.setColorDepth(8);
  display::clk.loadFont(ZdyLwFont_20);

  display::clk.createSprite(58, 24);
  display::clk.fillSprite(app_config::kColorBg);
  display::clk.setTextDatum(CC_DATUM);
  display::clk.setTextColor(TFT_WHITE, app_config::kColorBg);
  display::clk.drawString(String(view.temperatureText.c_str()) + "℃", 28, 13);
  display::clk.pushSprite(100, 184);
  display::clk.deleteSprite();

  updateTemperatureBar(view.temperatureC);
  drawTempBar();

  display::clk.createSprite(58, 24);
  display::clk.fillSprite(app_config::kColorBg);
  display::clk.setTextDatum(CC_DATUM);
  display::clk.setTextColor(TFT_WHITE, app_config::kColorBg);
  display::clk.drawString(view.humidityText.c_str(), 28, 13);
  display::clk.pushSprite(100, 214);
  display::clk.deleteSprite();

  updateHumidityBar(view.humidityPercent);
  drawHumidityBar();

  display::clk.createSprite(94, 30);
  display::clk.fillSprite(app_config::kColorBg);
  display::clk.setTextDatum(CC_DATUM);
  display::clk.setTextColor(TFT_WHITE, app_config::kColorBg);
  display::clk.drawString(view.cityName.c_str(), 44, 16);
  display::clk.pushSprite(15, 15);
  display::clk.deleteSprite();

  uint16_t aqiBg = 0;
  const char *aqiText = aqiLabel(view.aqi, aqiBg);
  display::clk.createSprite(56, 24);
  display::clk.fillSprite(app_config::kColorBg);
  display::clk.fillRoundRect(0, 0, 50, 24, 4, aqiBg);
  display::clk.setTextDatum(CC_DATUM);
  display::clk.setTextColor(0x0000);
  display::clk.drawString(aqiText, 25, 13);
  display::clk.pushSprite(104, 18);
  display::clk.deleteSprite();

  display::clk.unloadFont();
  s_weather.printfweather(170, 15, view.weatherCode);
}

void drawIndoorClimate(float temperatureC, float humidityPercent)
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
  display::clk.drawFloat(temperatureC, 1, 20, 13);
  display::clk.drawString("℃", 50, 13);
  display::clk.pushSprite(170, 184);
  display::clk.deleteSprite();

  display::clk.createSprite(60, 24);
  display::clk.fillSprite(app_config::kColorBg);
  display::clk.setTextDatum(CC_DATUM);
  display::clk.setTextColor(TFT_WHITE, app_config::kColorBg);
  display::clk.drawFloat(humidityPercent, 1, 20, 13);
  display::clk.drawString("%", 50, 13);
  display::clk.pushSprite(170, 214);
  display::clk.deleteSprite();

  display::clk.unloadFont();
}

void copyBannerLines(const std::array<std::string, app_config::kBannerSlotCount> &lines)
{
  for (size_t index = 0; index < lines.size(); ++index)
  {
    s_bannerLines[index] = lines[index].c_str();
  }
  s_bannerIndex = 0;
}

} // namespace

void refreshClock()
{
  if (!s_mainPageActive)
    return;
  drawClockDigits(false);
  drawDate();
}

void forceClockRedraw()
{
  s_lastHour = -1;
  s_lastMinute = -1;
  s_lastSecond = -1;
  drawClockDigits(true);
  drawDate();
}

void refreshBanner()
{
  if (!s_mainPageActive)
    return;

  String text;
  for (size_t attempts = 0; attempts < s_bannerLines.size(); ++attempts)
  {
    const int index = (s_bannerIndex + attempts) % app_config::kBannerSlotCount;
    if (s_bannerLines[index].length() == 0)
      continue;
    text = s_bannerLines[index];
    s_bannerIndex = (index + 1) % app_config::kBannerSlotCount;
    break;
  }

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
}

void drawSplashPage(const app::SplashViewData &view)
{
  s_mainPageActive = false;
  display::clear();
  display::clk.setColorDepth(8);
  display::clk.createSprite(220, 100);
  display::clk.fillSprite(app_config::kColorBg);
  display::clk.setTextDatum(CC_DATUM);
  display::clk.setTextColor(TFT_WHITE, app_config::kColorBg);
  display::clk.drawString(view.title.c_str(), 110, 30, 2);
  display::clk.setTextColor(TFT_GREEN, app_config::kColorBg);
  display::clk.drawString(view.detail.c_str(), 110, 65, 2);
  display::clk.pushSprite(10, 70);
  display::clk.deleteSprite();
}

void drawErrorPage(const app::ErrorViewData &view)
{
  s_mainPageActive = false;
  display::clear();
  display::clk.setColorDepth(8);
  display::clk.createSprite(220, 120);
  display::clk.fillSprite(app_config::kColorBg);
  display::clk.setTextDatum(CC_DATUM);
  display::clk.setTextColor(TFT_RED, app_config::kColorBg);
  display::clk.drawString(view.title.c_str(), 110, 24, 2);
  display::clk.setTextColor(TFT_WHITE, app_config::kColorBg);
  display::clk.drawString(view.detail.c_str(), 110, 58, 2);
  if (view.retrying)
  {
    display::clk.setTextColor(TFT_GREEN, app_config::kColorBg);
    display::clk.drawString("Retrying...", 110, 92, 2);
  }
  display::clk.pushSprite(10, 50);
  display::clk.deleteSprite();
}

void drawMainPage(const app::MainViewData &view)
{
  s_mainPageActive = true;
  display::clear();
  display::drawTempHumidityIcons();
  copyBannerLines(view.bannerLines);
  drawWeatherMain(view);
  if (view.showIndoorClimate)
  {
    drawIndoorClimate(view.indoorTemperatureC, view.indoorHumidityPercent);
  }
  forceClockRedraw();
  refreshBanner();
}

} // namespace screen
