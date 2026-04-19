#include "Screen.h"

#include <Arduino.h>
#include <TimeLib.h>

#include "AppConfig.h"
#include "Display.h"
#include "app/UiMotion.h"
#include "app/TransientUi.h"
#include "font/timeClockFont.h"
#include "weatherNum/weatherNum.h"

namespace screen
{

namespace
{

struct MenuMotionState
{
  app::MotionValue boxY;
  app::MotionValue boxWidth;
  std::size_t selectedIndex = 0;
  bool active = false;
};

struct InfoMotionState
{
  app::MotionValue scrollOffset;
  app::MotionValue selectionY;
  std::size_t selectedIndex = 0;
  bool active = false;
};

WeatherNum s_weather;
std::array<String, app_config::kBannerSlotCount> s_bannerLines{};
int s_bannerIndex = 0;
int s_lastHourTens = -1;
int s_lastHourOnes = -1;
int s_lastMinuteTens = -1;
int s_lastMinuteOnes = -1;
int s_lastSecondTens = -1;
int s_lastSecondOnes = -1;
int s_tempPercent = 0;
int s_humidityPercent = 0;
uint16_t s_tempColor = 0xFFFF;
uint16_t s_humidityColor = 0xFFFF;
bool s_mainPageActive = false;
int s_lastHoldFillWidth = -1;
bool s_holdVisible = false;
bool s_holdArmed = false;
app::GestureFeedbackKind s_gestureFeedbackKind = app::GestureFeedbackKind::None;
uint32_t s_gestureFeedbackStartedMs = 0;
bool s_gestureFeedbackDrawn = false;
MenuMotionState s_menuMotion;
InfoMotionState s_infoMotion;
app::OperationalPageKind s_motionPageKind = app::OperationalPageKind::Home;

constexpr int kHoldLineX = 14;
constexpr int kHoldLineY = 4;
constexpr int kHoldLineWidth = 212;
constexpr int kHoldLineHeight = 3;
constexpr int kTopTransientStripY = 0;
constexpr int kTopTransientStripHeight = 12;
constexpr int kGestureFeedbackX = 82;
constexpr int kGestureFeedbackY = 0;
constexpr int kGestureFeedbackWidth = 76;
constexpr int kGestureFeedbackHeight = 11;
constexpr int kPageBodyY = 44;
constexpr int kPageBodyHeight = 180;
constexpr uint8_t kMotionDivisor = 4;
constexpr int16_t kMotionSnapDistance = 1;

String weekText()
{
  static constexpr const char *kWeekdays[] = {"Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"};
  const int weekIndex = weekday();
  if (weekIndex < 1 || weekIndex > 7)
    return "---";
  return kWeekdays[weekIndex - 1];
}

String monthDayText()
{
  static constexpr const char *kMonths[] = {
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"};
  const int monthIndex = month();
  if (monthIndex < 1 || monthIndex > 12)
    return String(day());
  return String(kMonths[monthIndex - 1]) + " " + day();
}

const LineAtom *lineFontForDigit(uint32_t num, uint32_t size, uint32_t &fontSize)
{
  if (size == 1)
  {
    fontSize = smallLineFont_size[num];
    return smallLineFont[num];
  }

  if (size == 2)
  {
    fontSize = middleLineFont_size[num];
    return middleLineFont[num];
  }

  if (size == 3)
  {
    fontSize = largeLineFont_size[num];
    return largeLineFont[num];
  }

  fontSize = 0;
  return nullptr;
}

void drawLineFont(uint32_t x, uint32_t y, uint32_t num, uint32_t size, uint32_t color)
{
  uint32_t fontSize = 0;
  const LineAtom *fontOne = lineFontForDigit(num, size, fontSize);
  if (!fontOne)
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

void updateClockDigit(uint32_t x,
                      uint32_t y,
                      int digit,
                      int &lastDigit,
                      uint32_t size,
                      uint32_t color,
                      bool force)
{
  if (!force && digit == lastDigit)
  {
    return;
  }

  if (lastDigit >= 0)
  {
    drawLineFont(x, y, static_cast<uint32_t>(lastDigit), size, app_config::kColorBg);
  }

  drawLineFont(x, y, static_cast<uint32_t>(digit), size, color);
  lastDigit = digit;
}

void drawClockDigits(bool force)
{
  const int h = hour();
  const int m = minute();
  const int s = second();

  updateClockDigit(20, app_config::kTimeY, h / 10, s_lastHourTens, 3, app_config::kColorFontWhite, force);
  updateClockDigit(60, app_config::kTimeY, h % 10, s_lastHourOnes, 3, app_config::kColorFontWhite, force);
  updateClockDigit(101, app_config::kTimeY, m / 10, s_lastMinuteTens, 3, app_config::kColorFontYellow, force);
  updateClockDigit(141, app_config::kTimeY, m % 10, s_lastMinuteOnes, 3, app_config::kColorFontYellow, force);
  updateClockDigit(182, app_config::kTimeY + 30, s / 10, s_lastSecondTens, 2, app_config::kColorFontWhite, force);
  updateClockDigit(202, app_config::kTimeY + 30, s % 10, s_lastSecondOnes, 2, app_config::kColorFontWhite, force);
}

void drawDate()
{
  display::tft.fillRect(90, 14, 138, 34, app_config::kColorBg);
  display::tft.setTextDatum(TR_DATUM);
  display::tft.setTextColor(TFT_WHITE, app_config::kColorBg);
  display::tft.drawString(weekText(), 224, 22, 2);
  display::tft.setTextColor(TFT_LIGHTGREY, app_config::kColorBg);
  display::tft.drawString(monthDayText(), 224, 40, 2);
}

void drawTempBar()
{
  display::clk.setColorDepth(8);
  display::clk.createSprite(52, 6);
  display::clk.fillSprite(app_config::kColorBg);
  display::clk.drawRoundRect(0, 0, 52, 6, 3, 0xFFFF);
  display::clk.fillRoundRect(1, 1, s_tempPercent, 4, 2, s_tempColor);
  display::clk.pushSprite(42, 195);
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
  display::clk.pushSprite(42, 223);
  display::clk.deleteSprite();
}

void clearTopTransientStrip()
{
  display::tft.fillRect(0, kTopTransientStripY, 240, kTopTransientStripHeight, app_config::kColorBg);
}

void clearHoldLine()
{
  clearTopTransientStrip();
  s_lastHoldFillWidth = -1;
  s_holdVisible = false;
  s_holdArmed = false;
}

const char *gestureFeedbackText(app::GestureFeedbackKind kind)
{
  switch (kind)
  {
    case app::GestureFeedbackKind::Tap:
      return "Tap";

    case app::GestureFeedbackKind::Hold:
      return "Hold";

    case app::GestureFeedbackKind::Back:
      return "2x Back";

    case app::GestureFeedbackKind::None:
    default:
      return "";
  }
}

uint16_t gestureFeedbackColor(app::GestureFeedbackKind kind)
{
  switch (kind)
  {
    case app::GestureFeedbackKind::Tap:
      return TFT_WHITE;

    case app::GestureFeedbackKind::Hold:
      return TFT_YELLOW;

    case app::GestureFeedbackKind::Back:
      return TFT_CYAN;

    case app::GestureFeedbackKind::None:
    default:
      return TFT_WHITE;
  }
}

void refreshGestureFeedback(uint32_t nowMs)
{
  const bool visible = app::gestureFeedbackVisible(s_gestureFeedbackStartedMs, nowMs) &&
                       s_gestureFeedbackKind != app::GestureFeedbackKind::None;
  if (!visible)
  {
    if (s_gestureFeedbackDrawn)
    {
      clearTopTransientStrip();
      s_gestureFeedbackDrawn = false;
    }
    s_gestureFeedbackKind = app::GestureFeedbackKind::None;
    s_gestureFeedbackStartedMs = 0;
    return;
  }

  if (!app::gestureFeedbackShouldDraw(
        s_gestureFeedbackKind,
        s_gestureFeedbackStartedMs,
        nowMs,
        s_gestureFeedbackDrawn))
  {
    return;
  }

  clearTopTransientStrip();
  display::tft.fillRoundRect(
    kGestureFeedbackX,
    kGestureFeedbackY,
    kGestureFeedbackWidth,
    kGestureFeedbackHeight,
    5,
    TFT_DARKGREY);
  display::tft.drawRoundRect(
    kGestureFeedbackX,
    kGestureFeedbackY,
    kGestureFeedbackWidth,
    kGestureFeedbackHeight,
    5,
    gestureFeedbackColor(s_gestureFeedbackKind));
  display::tft.setTextDatum(MC_DATUM);
  display::tft.setTextColor(gestureFeedbackColor(s_gestureFeedbackKind), TFT_DARKGREY);
  display::tft.drawString(
    gestureFeedbackText(s_gestureFeedbackKind),
    kGestureFeedbackX + (kGestureFeedbackWidth / 2),
    kGestureFeedbackY + (kGestureFeedbackHeight / 2) + 1,
    1);
  s_gestureFeedbackDrawn = true;
}

void drawHoldLine(const app::HoldFeedbackViewData &hold, uint32_t nowMs)
{
  if (!hold.visible)
  {
    if (app::holdFeedbackShouldClearWhenHidden(s_holdVisible, s_holdArmed, s_lastHoldFillWidth))
    {
      clearHoldLine();
    }
    return;
  }

  const uint8_t progressPercent =
    app::holdFeedbackProgressPercent(hold.pressStartedMs, hold.armed, nowMs);

  const int fillWidth = (kHoldLineWidth * progressPercent) / 100;
  if (s_holdVisible && fillWidth == s_lastHoldFillWidth && hold.armed == s_holdArmed)
  {
    return;
  }

  clearTopTransientStrip();
  if (progressPercent == 0 && !hold.armed)
  {
    s_holdVisible = false;
    s_holdArmed = false;
    s_lastHoldFillWidth = -1;
    return;
  }

  display::tft.drawFastHLine(kHoldLineX, kHoldLineY + 1, kHoldLineWidth, TFT_DARKGREY);
  if (fillWidth > 0)
  {
    const uint16_t color = hold.armed ? TFT_YELLOW : TFT_WHITE;
    display::tft.fillRect(kHoldLineX, kHoldLineY, fillWidth, kHoldLineHeight, color);
  }

  s_holdVisible = true;
  s_holdArmed = hold.armed;
  s_lastHoldFillWidth = fillWidth;
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
    return "SEV";
  }
  if (aqi > 150)
  {
    aqiBg = display::tft.color565(186, 55, 121);
    return "POOR";
  }
  if (aqi > 100)
  {
    aqiBg = display::tft.color565(242, 159, 57);
    return "MOD";
  }
  if (aqi > 50)
  {
    aqiBg = display::tft.color565(247, 219, 100);
    return "FAIR";
  }
  return "GOOD";
}

void drawWeatherIconPanel(int weatherCode)
{
  const int panelX = 148;
  const int panelY = 154;
  const int panelW = 80;
  const int panelH = 74;

  display::tft.fillRoundRect(panelX, panelY, panelW, panelH, 10, display::tft.color565(18, 18, 18));
  display::tft.drawRoundRect(panelX, panelY, panelW, panelH, 10, TFT_DARKGREY);
  display::tft.setTextDatum(CC_DATUM);
  display::tft.setTextColor(TFT_LIGHTGREY, display::tft.color565(18, 18, 18));
  display::tft.drawString("NOW", panelX + (panelW / 2), panelY + 12, 1);
  s_weather.printfweather(panelX + 14, panelY + 18, weatherCode);
}

void drawWeatherMain(const app::MainViewData &view)
{
  display::clk.setColorDepth(8);

  display::tft.setTextDatum(TL_DATUM);
  display::tft.setTextColor(TFT_LIGHTGREY, app_config::kColorBg);
  display::tft.drawString("TEMP", 44, 170, 1);
  display::tft.drawString("HUM", 44, 202, 1);

  display::clk.createSprite(64, 18);
  display::clk.fillSprite(app_config::kColorBg);
  display::clk.setTextDatum(CC_DATUM);
  display::clk.setTextColor(TFT_WHITE, app_config::kColorBg);
  display::clk.drawString(String(view.temperatureText.c_str()) + "C", 32, 9, 2);
  display::clk.pushSprite(50, 177);
  display::clk.deleteSprite();

  updateTemperatureBar(view.temperatureC);
  drawTempBar();

  display::clk.createSprite(64, 18);
  display::clk.fillSprite(app_config::kColorBg);
  display::clk.setTextDatum(CC_DATUM);
  display::clk.setTextColor(TFT_WHITE, app_config::kColorBg);
  display::clk.drawString(view.humidityText.c_str(), 32, 9, 2);
  display::clk.pushSprite(50, 209);
  display::clk.deleteSprite();

  updateHumidityBar(view.humidityPercent);
  drawHumidityBar();

  uint16_t aqiBg = 0;
  const char *aqiText = aqiLabel(view.aqi, aqiBg);
  display::clk.createSprite(72, 20);
  display::clk.fillSprite(app_config::kColorBg);
  display::clk.fillRoundRect(0, 0, 72, 20, 5, aqiBg);
  display::clk.setTextDatum(CC_DATUM);
  display::clk.setTextColor(0x0000);
  display::clk.drawString(aqiText, 36, 10, 2);
  display::clk.pushSprite(14, 16);
  display::clk.deleteSprite();

  drawWeatherIconPanel(view.weatherCode);
}

void drawFooterHints(const app::FooterHints &footer)
{
  if (footer.shortPressLabel.empty() &&
      footer.longPressLabel.empty() &&
      footer.doublePressLabel.empty())
  {
    return;
  }

  const String text =
    String("Tap ") + footer.shortPressLabel.c_str() +
    "  Hold " + footer.longPressLabel.c_str() +
    "  2x " + footer.doublePressLabel.c_str();
  const int footerY = 232;
  display::tft.fillRoundRect(8, footerY - 8, 224, 16, 5, TFT_DARKGREY);
  display::tft.drawRoundRect(8, footerY - 8, 224, 16, 5, TFT_LIGHTGREY);
  display::tft.setTextDatum(MC_DATUM);
  display::tft.setTextColor(TFT_WHITE, TFT_DARKGREY);
  display::tft.drawString(text, 120, footerY, 1);
}

void clearPageBody()
{
  display::tft.fillRect(0, kPageBodyY, 240, kPageBodyHeight, app_config::kColorBg);
}

void drawPageChrome(const std::string &title, const app::FooterHints &footer)
{
  display::clear();
  display::tft.fillRoundRect(12, 12, 216, 24, 6, TFT_DARKGREY);
  display::tft.drawRoundRect(12, 12, 216, 24, 6, TFT_LIGHTGREY);
  display::tft.setTextDatum(ML_DATUM);
  display::tft.setTextColor(TFT_WHITE, TFT_DARKGREY);
  display::tft.drawString(title.c_str(), 20, 24, 2);
  drawFooterHints(footer);
}

std::size_t selectedMenuIndex(const app::MenuBodyData &menu)
{
  for (std::size_t index = 0; index < menu.itemCount; ++index)
  {
    if (menu.items[index].selected)
    {
      return index;
    }
  }

  return 0;
}

int16_t menuSelectionWidth(const app::MenuBodyData &menu, std::size_t index)
{
  if (menu.itemCount == 0)
  {
    return 0;
  }

  const std::size_t safeIndex = (index < menu.itemCount) ? index : (menu.itemCount - 1);
  const int width = display::tft.textWidth(menu.items[safeIndex].label.c_str(), 2) + 24;
  return static_cast<int16_t>(width > 208 ? 208 : width);
}

void syncMenuMotion(const app::MenuBodyData &menu, bool snap)
{
  const std::size_t selectedIndex = selectedMenuIndex(menu);
  s_menuMotion.selectedIndex = selectedIndex;

  const int16_t yTarget = app::menuBoxYForIndex(selectedIndex);
  const int16_t widthTarget = menuSelectionWidth(menu, selectedIndex);
  if (snap)
  {
    app::snapMotion(s_menuMotion.boxY, yTarget);
    app::snapMotion(s_menuMotion.boxWidth, widthTarget);
    s_menuMotion.active = false;
    return;
  }

  app::retargetMotion(s_menuMotion.boxY, yTarget);
  app::retargetMotion(s_menuMotion.boxWidth, widthTarget);
  s_menuMotion.active = !s_menuMotion.boxY.settled || !s_menuMotion.boxWidth.settled;
}

void syncInfoMotion(const app::InfoBodyData &info, bool snap)
{
  const std::size_t selectedIndex = (info.rowCount == 0 || info.selectedRowIndex < info.rowCount)
                                      ? info.selectedRowIndex
                                      : (info.rowCount - 1);
  s_infoMotion.selectedIndex = selectedIndex;

  const int16_t scrollTarget = app::infoScrollOffsetForFirstVisible(info.firstVisibleRowIndex);
  const int16_t selectionTarget = app::infoSelectionBoxY(info.firstVisibleRowIndex, selectedIndex);
  if (snap)
  {
    app::snapMotion(s_infoMotion.scrollOffset, scrollTarget);
    app::snapMotion(s_infoMotion.selectionY, selectionTarget);
    s_infoMotion.active = false;
    return;
  }

  app::retargetMotion(s_infoMotion.scrollOffset, scrollTarget);
  app::retargetMotion(s_infoMotion.selectionY, selectionTarget);
  s_infoMotion.active = !s_infoMotion.scrollOffset.settled || !s_infoMotion.selectionY.settled;
}

bool tickMenuMotion(const app::MenuBodyData &menu)
{
  if (menu.itemCount == 0)
  {
    s_menuMotion.active = false;
    return false;
  }

  const bool movedY = app::advanceMotion(s_menuMotion.boxY, kMotionDivisor, kMotionSnapDistance);
  const bool movedWidth = app::advanceMotion(s_menuMotion.boxWidth, kMotionDivisor, kMotionSnapDistance);
  s_menuMotion.active = !s_menuMotion.boxY.settled || !s_menuMotion.boxWidth.settled;
  return movedY || movedWidth;
}

bool tickInfoMotion(const app::InfoBodyData &info)
{
  if (info.rowCount == 0)
  {
    s_infoMotion.active = false;
    return false;
  }

  const bool movedScroll = app::advanceMotion(s_infoMotion.scrollOffset, kMotionDivisor, kMotionSnapDistance);
  const bool movedSelection = app::advanceMotion(s_infoMotion.selectionY, kMotionDivisor, kMotionSnapDistance);
  s_infoMotion.active = !s_infoMotion.scrollOffset.settled || !s_infoMotion.selectionY.settled;
  return movedScroll || movedSelection;
}

void drawMenuItemsBase(const app::MenuBodyData &menu)
{
  const std::size_t selectedIndex = selectedMenuIndex(menu);

  for (std::size_t index = 0; index < menu.itemCount; ++index)
  {
    const int y = app::menuBoxYForIndex(index);

    display::tft.fillRoundRect(16, y, 208, 30, 6, TFT_BLACK);
    display::tft.drawRoundRect(16, y, 208, 30, 6, TFT_DARKGREY);
    if (index == selectedIndex)
    {
      continue;
    }

    display::tft.setTextDatum(ML_DATUM);
    display::tft.setTextColor(TFT_WHITE, TFT_BLACK);
    display::tft.drawString(menu.items[index].label.c_str(), 28, y + 15, 2);
  }
}

void drawAnimatedMenuSelection(const app::MenuBodyData &menu)
{
  if (menu.itemCount == 0)
  {
    return;
  }

  const std::size_t selectedIndex =
    (s_menuMotion.selectedIndex < menu.itemCount) ? s_menuMotion.selectedIndex : (menu.itemCount - 1);
  const int16_t boxWidth = s_menuMotion.boxWidth.current;
  if (boxWidth <= 0)
  {
    return;
  }

  display::tft.fillRoundRect(16, s_menuMotion.boxY.current, boxWidth, 30, 6, TFT_YELLOW);
  display::tft.drawRoundRect(16, s_menuMotion.boxY.current, boxWidth, 30, 6, TFT_WHITE);
  display::tft.setViewport(16, s_menuMotion.boxY.current, boxWidth, 30, false);
  display::tft.setTextDatum(ML_DATUM);
  display::tft.setTextColor(TFT_BLACK, TFT_YELLOW);
  display::tft.drawString(menu.items[selectedIndex].label.c_str(), 28, s_menuMotion.boxY.current + 15, 2);
  display::tft.resetViewport();
}

void drawToast(const app::ToastData &toast)
{
  if (!toast.visible)
  {
    return;
  }

  display::tft.fillRoundRect(22, 96, 196, 36, 10, TFT_DARKGREY);
  display::tft.drawRoundRect(22, 96, 196, 36, 10, TFT_YELLOW);
  display::tft.setTextDatum(MC_DATUM);
  display::tft.setTextColor(TFT_WHITE, TFT_DARKGREY);
  display::tft.drawString(toast.text.c_str(), 120, 114, 2);
}

void drawMenuPage(const app::MenuBodyData &menu, const app::FooterHints &footer)
{
  drawPageChrome(menu.title, footer);
  drawMenuItemsBase(menu);
  drawAnimatedMenuSelection(menu);
}

void drawMenuBody(const app::MenuBodyData &menu)
{
  clearPageBody();
  drawMenuItemsBase(menu);
  drawAnimatedMenuSelection(menu);
}

void drawAnimatedInfoRows(const app::InfoBodyData &info)
{
  display::tft.setViewport(0, kPageBodyY, 240, kPageBodyHeight, false);

  for (std::size_t rowIndex = 0; rowIndex < info.rowCount; ++rowIndex)
  {
    const int y = 58 + static_cast<int>(rowIndex * 36) - s_infoMotion.scrollOffset.current;
    const int top = y - 6;
    const int bottom = top + 30;
    if (bottom < kPageBodyY || top > (kPageBodyY + kPageBodyHeight))
    {
      continue;
    }

    display::tft.fillRoundRect(14, top, 212, 30, 6, app_config::kColorBg);
    display::tft.drawRoundRect(14, top, 212, 30, 6, TFT_DARKGREY);
    display::tft.setTextDatum(TL_DATUM);
    display::tft.setTextColor(TFT_WHITE, app_config::kColorBg);
    display::tft.drawString(info.rows[rowIndex].label.c_str(), 20, y, 2);
    display::tft.setTextDatum(TR_DATUM);
    display::tft.setTextColor(TFT_YELLOW, app_config::kColorBg);
    display::tft.drawString(info.rows[rowIndex].value.c_str(), 220, y, 2);
  }

  if (info.rowCount > 0)
  {
    const std::size_t selectedIndex =
      (s_infoMotion.selectedIndex < info.rowCount) ? s_infoMotion.selectedIndex : (info.rowCount - 1);
    const int y = s_infoMotion.selectionY.current + 6;
    display::tft.fillRoundRect(14, s_infoMotion.selectionY.current, 212, 30, 6, TFT_DARKGREY);
    display::tft.drawRoundRect(14, s_infoMotion.selectionY.current, 212, 30, 6, TFT_YELLOW);
    display::tft.setTextDatum(TL_DATUM);
    display::tft.setTextColor(TFT_WHITE, TFT_DARKGREY);
    display::tft.drawString(info.rows[selectedIndex].label.c_str(), 20, y, 2);
    display::tft.setTextDatum(TR_DATUM);
    display::tft.setTextColor(TFT_WHITE, TFT_DARKGREY);
    display::tft.drawString(info.rows[selectedIndex].value.c_str(), 220, y, 2);
  }

  display::tft.resetViewport();
}

void drawInfoPage(const app::InfoBodyData &info, const app::FooterHints &footer)
{
  drawPageChrome(info.title, footer);
  drawAnimatedInfoRows(info);
}

void drawInfoBody(const app::InfoBodyData &info)
{
  clearPageBody();
  drawAnimatedInfoRows(info);
}

void drawAdjustBodyContent(const app::AdjustBodyData &adjust)
{
  const int barX = 24;
  const int barY = 170;
  const int barWidth = 192;
  const int barHeight = 18;
  const int fillWidth = ((adjust.value - adjust.minValue) * barWidth) /
                        ((adjust.maxValue - adjust.minValue) > 0 ? (adjust.maxValue - adjust.minValue) : 1);

  display::tft.setTextDatum(MC_DATUM);
  display::tft.setTextColor(TFT_WHITE, app_config::kColorBg);
  display::tft.drawString(String(adjust.value).c_str(), 120, 108, 7);
  display::tft.setTextColor(TFT_YELLOW, app_config::kColorBg);
  display::tft.drawString(adjust.unit.c_str(), 186, 108, 4);

  display::tft.drawRoundRect(barX, barY, barWidth, barHeight, 8, TFT_WHITE);
  display::tft.fillRoundRect(barX + 2, barY + 2, fillWidth > 4 ? fillWidth - 4 : 0, barHeight - 4, 6, TFT_YELLOW);
  display::tft.setTextDatum(MC_DATUM);
  display::tft.setTextColor(TFT_LIGHTGREY, app_config::kColorBg);
  display::tft.drawString("Preset brightness", 120, 208, 2);
}

void drawAdjustPage(const app::AdjustBodyData &adjust, const app::FooterHints &footer)
{
  drawPageChrome(adjust.title, footer);
  drawAdjustBodyContent(adjust);
}

void drawAdjustBody(const app::AdjustBodyData &adjust)
{
  clearPageBody();
  drawAdjustBodyContent(adjust);
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
  s_lastHourTens = -1;
  s_lastHourOnes = -1;
  s_lastMinuteTens = -1;
  s_lastMinuteOnes = -1;
  s_lastSecondTens = -1;
  s_lastSecondOnes = -1;
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

  display::tft.fillRect(10, 54, 220, 18, app_config::kColorBg);
  display::tft.setTextDatum(CC_DATUM);
  display::tft.setTextColor(TFT_WHITE, app_config::kColorBg);
  display::tft.drawString(text, 120, 63, 2);
}

void drawSplashPage(const app::SplashViewData &view)
{
  s_mainPageActive = false;
  display::clear();
  clearHoldLine();
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
  clearHoldLine();
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
  if (view.pageKind == app::OperationalPageKind::Home)
  {
    s_mainPageActive = true;
    display::clear();
    display::drawTempHumidityIcons();
    copyBannerLines(view.bannerLines);
    drawWeatherMain(view);
    forceClockRedraw();
    refreshBanner();
    drawToast(view.toast);
    drawHoldLine(view.holdFeedback, millis());
    return;
  }

  s_mainPageActive = false;
  switch (view.pageKind)
  {
    case app::OperationalPageKind::Menu:
      drawMenuPage(view.menu, view.footer);
      break;

    case app::OperationalPageKind::Info:
      drawInfoPage(view.info, view.footer);
      break;

    case app::OperationalPageKind::Adjust:
      drawAdjustPage(view.adjust, view.footer);
      break;

    case app::OperationalPageKind::Home:
      break;
  }

  drawHoldLine(view.holdFeedback, millis());
}

void drawMainPageRegion(const app::MainViewData &view, app::RenderRegion region)
{
  s_mainPageActive = false;

  switch (region)
  {
    case app::RenderRegion::MenuBody:
      if (view.pageKind == app::OperationalPageKind::Menu)
      {
        drawMenuBody(view.menu);
      }
      break;

    case app::RenderRegion::InfoBody:
      if (view.pageKind == app::OperationalPageKind::Info)
      {
        drawInfoBody(view.info);
      }
      break;

    case app::RenderRegion::AdjustBody:
      if (view.pageKind == app::OperationalPageKind::Adjust)
      {
        drawAdjustBody(view.adjust);
      }
      break;

    case app::RenderRegion::FullScreen:
      drawMainPage(view);
      break;
  }
}

void syncMotionTargets(const app::MainViewData &view, app::RenderRegion region)
{
  const bool snap = (region == app::RenderRegion::FullScreen) || (s_motionPageKind != view.pageKind);
  if (snap)
  {
    syncMenuMotion(view.menu, true);
    syncInfoMotion(view.info, true);
  }
  else
  {
    switch (view.pageKind)
    {
      case app::OperationalPageKind::Menu:
        syncMenuMotion(view.menu, false);
        break;

      case app::OperationalPageKind::Info:
        syncInfoMotion(view.info, false);
        break;

      case app::OperationalPageKind::Adjust:
      case app::OperationalPageKind::Home:
        break;
    }
  }

  if (view.pageKind != app::OperationalPageKind::Menu)
  {
    s_menuMotion.active = false;
  }

  if (view.pageKind != app::OperationalPageKind::Info)
  {
    s_infoMotion.active = false;
  }

  s_motionPageKind = view.pageKind;
}

void refreshMotion(const app::MainViewData &view, uint32_t nowMs)
{
  (void)nowMs;

  switch (view.pageKind)
  {
    case app::OperationalPageKind::Menu:
      if (s_menuMotion.active && tickMenuMotion(view.menu))
      {
        drawMainPageRegion(view, app::RenderRegion::MenuBody);
      }
      break;

    case app::OperationalPageKind::Info:
      if (s_infoMotion.active && tickInfoMotion(view.info))
      {
        drawMainPageRegion(view, app::RenderRegion::InfoBody);
      }
      break;

    case app::OperationalPageKind::Adjust:
    case app::OperationalPageKind::Home:
      break;
  }
}

void refreshHoldFeedback(const app::HoldFeedbackViewData &hold, uint32_t nowMs)
{
  drawHoldLine(hold, nowMs);
  if (!hold.visible)
  {
    refreshGestureFeedback(nowMs);
  }
}

void showGestureFeedback(app::GestureFeedbackKind kind, uint32_t nowMs)
{
  s_holdVisible = false;
  s_holdArmed = false;
  s_lastHoldFillWidth = -1;
  s_gestureFeedbackKind = kind;
  s_gestureFeedbackStartedMs = nowMs;
  s_gestureFeedbackDrawn = false;
  refreshGestureFeedback(nowMs);
}

} // namespace screen
