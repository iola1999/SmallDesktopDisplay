#include "ui/TftDisplayPort.h"

#include "Display.h"
#include "Screen.h"

namespace ui
{

void TftDisplayPort::begin(uint8_t rotation, uint8_t brightness)
{
  display::begin(rotation);
  display::setBrightness(brightness);
}

void TftDisplayPort::setBrightness(uint8_t brightness)
{
  display::setBrightness(brightness);
}

void TftDisplayPort::setRotation(uint8_t rotation)
{
  display::setRotation(rotation);
}

void TftDisplayPort::tickClock()
{
  screen::refreshClock();
}

void TftDisplayPort::tickBanner()
{
  screen::refreshBanner();
}

void TftDisplayPort::tickTransientUi(const app::AppViewModel &view, uint32_t nowMs)
{
  if (view.kind != app::ViewKind::Main)
  {
    return;
  }

  screen::refreshHoldFeedback(view.main.holdFeedback, nowMs);
}

void TftDisplayPort::showGestureFeedback(app::GestureFeedbackKind kind, uint32_t nowMs)
{
  screen::showGestureFeedback(kind, nowMs);
}

void TftDisplayPort::render(const app::AppViewModel &view)
{
  switch (view.kind)
  {
    case app::ViewKind::Splash:
      screen::drawSplashPage(view.splash);
      break;

    case app::ViewKind::Error:
      screen::drawErrorPage(view.error);
      break;

    case app::ViewKind::Main:
      screen::drawMainPage(view.main);
      break;
  }
}

} // namespace ui
