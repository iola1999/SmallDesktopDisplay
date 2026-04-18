#ifndef APP_HOME_ANIMATION_TRANSITION_H
#define APP_HOME_ANIMATION_TRANSITION_H

#include "AppViewModel.h"

namespace app
{

enum class HomeAnimationTransitionPhase
{
  BeforeRender,
  AfterRender,
};

inline HomeAnimationTransitionPhase homeAnimationTransitionPhase(bool wasHomeActive,
                                                                const AppViewModel &view)
{
  const bool isHomeActive = view.kind == ViewKind::Main && view.main.homeAnimationEnabled;
  return (wasHomeActive && !isHomeActive) ? HomeAnimationTransitionPhase::BeforeRender
                                          : HomeAnimationTransitionPhase::AfterRender;
}

} // namespace app

#endif // APP_HOME_ANIMATION_TRANSITION_H
