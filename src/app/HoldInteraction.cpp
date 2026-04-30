#include "app/HoldInteraction.h"

namespace app
{

HoldInteractionAction applyHoldEvent(HoldInteractionState &state, HoldEvent event)
{
  HoldInteractionAction action;

  switch (event)
  {
  case HoldEvent::PressStarted:
    state.active = true;
    state.armed = false;
    state.posted = false;
    state.overlayDrawn = false;
    action.resetOverlayProgress = true;
    return action;

  case HoldEvent::LongPressArmed:
    if (state.active)
    {
      state.armed = true;
    }
    return action;

  case HoldEvent::PressReleased:
    if (state.active && state.armed && !state.posted)
    {
      state.posted = true;
      action.postLongPress = true;
    }
    action.clearOverlay = state.overlayDrawn;
    state.active = false;
    state.armed = false;
    state.overlayDrawn = false;
    return action;

  case HoldEvent::LongPress:
  default:
    return action;
  }
}

void markHoldOverlayDrawn(HoldInteractionState &state)
{
  if (state.active)
  {
    state.overlayDrawn = true;
  }
}

} // namespace app
