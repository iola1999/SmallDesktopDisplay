#include "Display.h"

#include <Arduino.h>
#include <TJpg_Decoder.h>

#include "AppConfig.h"
#include "img/humidity.h"
#include "img/temperature.h"

namespace display
{

TFT_eSPI tft = TFT_eSPI();
TFT_eSprite clk = TFT_eSprite(&tft);

namespace
{
uint8_t s_loadingProgress = 6;
}

bool tftOutput(int16_t x, int16_t y, uint16_t w, uint16_t h, uint16_t *bitmap)
{
  if (y >= tft.height())
    return false;
  tft.pushImage(x, y, w, h, bitmap);
  return true;
}

void begin(uint8_t rotation)
{
  pinMode(app_config::kPinLcdBacklight, OUTPUT);
  analogWrite(app_config::kPinLcdBacklight, 1023 - (app_config::kDefaultLcdBrightness * 10));

  tft.begin();
  tft.invertDisplay(1);
  tft.setRotation(rotation);
  tft.fillScreen(app_config::kColorBg);
  tft.setTextColor(TFT_BLACK, app_config::kColorBg);

  TJpgDec.setJpgScale(1);
  TJpgDec.setSwapBytes(true);
  TJpgDec.setCallback(tftOutput);
}

void setBrightness(uint8_t percent)
{
  if (percent > 100)
    percent = 100;
  analogWrite(app_config::kPinLcdBacklight, 1023 - (percent * 10));
}

void setRotation(uint8_t rotation)
{
  tft.setRotation(rotation);
}

void clear()
{
  tft.fillScreen(app_config::kColorBg);
}

void drawLoading(uint32_t delayMs, uint8_t step)
{
  s_loadingProgress += step;
  if (s_loadingProgress > 194)
    s_loadingProgress = 194;

  clk.setColorDepth(8);
  clk.createSprite(200, 100);
  clk.fillSprite(app_config::kColorBg);
  clk.drawRoundRect(0, 0, 200, 16, 8, 0xFFFF);
  clk.fillRoundRect(3, 3, s_loadingProgress, 10, 5, 0xFFFF);
  clk.setTextDatum(CC_DATUM);
  clk.setTextColor(TFT_GREEN, app_config::kColorBg);
  clk.drawString("Connecting to WiFi......", 100, 40, 2);
  clk.setTextColor(TFT_WHITE, app_config::kColorBg);
  clk.drawRightString(app_config::kVersion, 180, 60, 2);
  clk.pushSprite(20, 120);
  clk.deleteSprite();

  delay(delayMs);
}

void drawTempHumidityIcons()
{
  TJpgDec.drawJpg(15, 183, temperature, sizeof(temperature));
  TJpgDec.drawJpg(15, 213, humidity, sizeof(humidity));
}

} // namespace display
