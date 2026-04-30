#ifndef APP_HOLD_INTERACTION_H
#define APP_HOLD_INTERACTION_H

namespace app
{

enum class HoldEvent
{
  PressStarted,
  PressReleased,
  LongPressArmed,
  LongPress,
};

struct HoldInteractionState
{
  bool active = false;
  bool armed = false;
  bool posted = false;
  bool overlayDrawn = false;
};

struct HoldInteractionAction
{
  bool clearOverlay = false;
  bool postLongPress = false;
  bool resetOverlayProgress = false;
};

HoldInteractionAction applyHoldEvent(HoldInteractionState &state, HoldEvent event);
void markHoldOverlayDrawn(HoldInteractionState &state);

} // namespace app

#endif // APP_HOLD_INTERACTION_H
