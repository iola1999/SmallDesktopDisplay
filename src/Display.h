#ifndef DISPLAY_H
#define DISPLAY_H

#include <TFT_eSPI.h>
#include <stdint.h>

// ============================================================
// TFT 屏幕底层封装
// ============================================================

namespace display
{

extern TFT_eSPI tft;
extern TFT_eSprite clk;

void begin(uint8_t rotation);         // TFT init + 背光引脚
void setBrightness(uint8_t percent);  // 0-100
void setRotation(uint8_t rotation);
void clear();                         // fillScreen(kColorBg)

// 进度条 (开机连接 WiFi 时显示)
void drawLoading(uint32_t delayMs, uint8_t step);

} // namespace display

#endif // DISPLAY_H
