#include "ui/TftDisplayPort.h"

#include "Display.h"
#include "Screen.h"
#include "app/RenderPlan.h"

namespace ui
{

void TftDisplayPort::begin(uint8_t rotation, uint8_t brightness)
{
  display::begin(rotation);
  display::setBrightness(brightness);
  hasLastView_ = false;
}

void TftDisplayPort::setBrightness(uint8_t brightness)
{
  display::setBrightness(brightness);
}

void TftDisplayPort::setRotation(uint8_t rotation)
{
  display::setRotation(rotation);
  hasLastView_ = false;
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
  const app::RenderPlan plan = app::planRender(hasLastView_, lastView_, view);

  switch (plan.region)
  {
    case app::RenderRegion::MenuBody:
    case app::RenderRegion::InfoBody:
    case app::RenderRegion::AdjustBody:
      screen::drawMainPageRegion(view.main, plan.region);
      break;

    case app::RenderRegion::FullScreen:
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
      break;
  }

  lastView_ = view;
  hasLastView_ = true;
}

} // namespace ui
