#ifndef SCREEN_H
#define SCREEN_H

#include "app/RenderPlan.h"
#include "app/TransientUi.h"
#include "app/AppViewModel.h"

namespace screen
{

void refreshClock();
void refreshBanner();
void refreshHoldFeedback(const app::HoldFeedbackViewData &hold, uint32_t nowMs);
void showGestureFeedback(app::GestureFeedbackKind kind, uint32_t nowMs);
void forceClockRedraw();
void drawSplashPage(const app::SplashViewData &view);
void drawErrorPage(const app::ErrorViewData &view);
void drawMainPage(const app::MainViewData &view);
void drawMainPageRegion(const app::MainViewData &view, app::RenderRegion region);

} // namespace screen

#endif // SCREEN_H
