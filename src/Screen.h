#ifndef SCREEN_H
#define SCREEN_H

#include "app/AppViewModel.h"

namespace screen
{

void refreshClock();
void refreshBanner();
void forceClockRedraw();
void drawSplashPage(const app::SplashViewData &view);
void drawErrorPage(const app::ErrorViewData &view);
void drawMainPage(const app::MainViewData &view);

} // namespace screen

#endif // SCREEN_H
