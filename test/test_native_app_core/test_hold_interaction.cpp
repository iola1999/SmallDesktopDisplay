#include <doctest.h>

#include "app/HoldInteraction.h"

TEST_CASE("short click release does not clear an overlay that was never drawn")
{
  app::HoldInteractionState state;

  app::applyHoldEvent(state, app::HoldEvent::PressStarted);
  const app::HoldInteractionAction action = app::applyHoldEvent(state, app::HoldEvent::PressReleased);

  CHECK_FALSE(action.clearOverlay);
  CHECK_FALSE(action.postLongPress);
  CHECK_FALSE(state.active);
}

TEST_CASE("long press arms without posting until release")
{
  app::HoldInteractionState state;

  app::applyHoldEvent(state, app::HoldEvent::PressStarted);
  const app::HoldInteractionAction armed = app::applyHoldEvent(state, app::HoldEvent::LongPressArmed);

  CHECK_FALSE(armed.postLongPress);
  CHECK(state.active);
  CHECK(state.armed);

  const app::HoldInteractionAction released = app::applyHoldEvent(state, app::HoldEvent::PressReleased);

  CHECK(released.postLongPress);
  CHECK_FALSE(state.active);
}

TEST_CASE("button long press callback after release does not post twice")
{
  app::HoldInteractionState state;

  app::applyHoldEvent(state, app::HoldEvent::PressStarted);
  app::applyHoldEvent(state, app::HoldEvent::LongPressArmed);
  const app::HoldInteractionAction released = app::applyHoldEvent(state, app::HoldEvent::PressReleased);
  const app::HoldInteractionAction callback = app::applyHoldEvent(state, app::HoldEvent::LongPress);

  CHECK(released.postLongPress);
  CHECK_FALSE(callback.postLongPress);
}

TEST_CASE("drawn overlay is cleared on release")
{
  app::HoldInteractionState state;

  app::applyHoldEvent(state, app::HoldEvent::PressStarted);
  app::markHoldOverlayDrawn(state);
  const app::HoldInteractionAction action = app::applyHoldEvent(state, app::HoldEvent::PressReleased);

  CHECK(action.clearOverlay);
}
