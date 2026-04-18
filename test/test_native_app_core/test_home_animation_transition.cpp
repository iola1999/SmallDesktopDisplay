#include <doctest.h>

#include "app/HomeAnimationTransition.h"

TEST_CASE("home animation deactivates before render when leaving home")
{
  app::AppViewModel view;
  view.kind = app::ViewKind::Main;
  view.main.homeAnimationEnabled = false;

  CHECK(app::homeAnimationTransitionPhase(true, view) == app::HomeAnimationTransitionPhase::BeforeRender);
}

TEST_CASE("home animation updates after render in non-leaving transitions")
{
  app::AppViewModel homeView;
  homeView.kind = app::ViewKind::Main;
  homeView.main.homeAnimationEnabled = true;

  app::AppViewModel menuView;
  menuView.kind = app::ViewKind::Main;
  menuView.main.homeAnimationEnabled = false;

  CHECK(app::homeAnimationTransitionPhase(false, homeView) == app::HomeAnimationTransitionPhase::AfterRender);
  CHECK(app::homeAnimationTransitionPhase(false, menuView) == app::HomeAnimationTransitionPhase::AfterRender);
  CHECK(app::homeAnimationTransitionPhase(true, homeView) == app::HomeAnimationTransitionPhase::AfterRender);
}
