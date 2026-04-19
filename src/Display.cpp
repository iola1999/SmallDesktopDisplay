#include "Display.h"

#include <Arduino.h>
#include <TJpg_Decoder.h>

#include "AppConfig.h"
#include "app/BacklightPwm.h"
#include "img/humidity.h"
#include "img/temperature.h"

namespace display
{

TFT_eSPI tft = TFT_eSPI();
TFT_eSprite clk = TFT_eSprite(&tft);

namespace
{
uint8_t s_loadingProgress = 6;
bool s_loadingUiDrawn = false;
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
  Serial.println(F("[Display] begin enter"));
  pinMode(app_config::kPinLcdBacklight, OUTPUT);
  analogWriteRange(app::kBacklightPwmRange);
  analogWrite(app_config::kPinLcdBacklight,
              app::backlightPwmDutyForPercent(app_config::kDefaultLcdBrightness));
  Serial.println(F("[Display] backlight ready"));

  Serial.println(F("[Display] tft.begin"));
  tft.begin();
  Serial.println(F("[Display] tft.begin ok"));
  Serial.println(F("[Display] invertDisplay"));
  tft.invertDisplay(1);
  Serial.println(F("[Display] setRotation"));
  tft.setRotation(rotation);
  Serial.println(F("[Display] fillScreen"));
  tft.fillScreen(app_config::kColorBg);
  s_loadingUiDrawn = false;
  Serial.println(F("[Display] text color"));
  tft.setTextColor(TFT_BLACK, app_config::kColorBg);

  Serial.println(F("[Display] jpeg setup"));
  TJpgDec.setJpgScale(1);
  TJpgDec.setSwapBytes(true);
  TJpgDec.setCallback(tftOutput);
  Serial.println(F("[Display] begin done"));
}

void setBrightness(uint8_t percent)
{
  analogWriteRange(app::kBacklightPwmRange);
  analogWrite(app_config::kPinLcdBacklight, app::backlightPwmDutyForPercent(percent));
}

void setRotation(uint8_t rotation)
{
  tft.setRotation(rotation);
}

void clear()
{
  tft.fillScreen(app_config::kColorBg);
  s_loadingUiDrawn = false;
}

void drawLoading(uint32_t delayMs, uint8_t step)
{
  s_loadingProgress += step;
  if (s_loadingProgress > 194)
    s_loadingProgress = 194;

  constexpr int kPanelX = 20;
  constexpr int kPanelY = 120;
  constexpr int kPanelWidth = 200;
  constexpr int kPanelHeight = 100;
  constexpr int kBarX = kPanelX;
  constexpr int kBarY = kPanelY;
  constexpr int kBarInnerX = kPanelX + 3;
  constexpr int kBarInnerY = kPanelY + 3;

  if (!s_loadingUiDrawn)
  {
    tft.fillRect(kPanelX, kPanelY, kPanelWidth, kPanelHeight, app_config::kColorBg);
    tft.drawRoundRect(kBarX, kBarY, 200, 16, 8, 0xFFFF);
    tft.setTextDatum(CC_DATUM);
    tft.setTextColor(TFT_GREEN, app_config::kColorBg);
    tft.drawString("Connecting to WiFi......", 120, 160, 2);
    tft.setTextColor(TFT_WHITE, app_config::kColorBg);
    tft.drawRightString(app_config::kVersion, 200, 180, 2);
    s_loadingUiDrawn = true;
  }

  // Avoid sprite push on ESP8266+WiFi: direct primitives do not hit TFT_eSPI::pushPixels().
  tft.fillRoundRect(kBarInnerX, kBarInnerY, s_loadingProgress, 10, 5, 0xFFFF);

  if (delayMs > 0)
  {
    delay(delayMs);
  }
}

void drawTempHumidityIcons()
{
  TJpgDec.drawJpg(15, 183, temperature, sizeof(temperature));
  TJpgDec.drawJpg(15, 213, humidity, sizeof(humidity));
}

} // namespace display
