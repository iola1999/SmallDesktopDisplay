#include "Input.h"

#include <Button2.h>

#include "AppConfig.h"

namespace input
{

namespace
{

Button2 s_button(app_config::kPinButton);
ButtonEvent s_pendingEvent = ButtonEvent::None;

void onClick(Button2 &)
{
  s_pendingEvent = ButtonEvent::ShortPress;
}

void onLongClick(Button2 &)
{
  s_pendingEvent = ButtonEvent::LongPress;
}

} // namespace

void begin()
{
  s_button.setClickHandler(onClick);
  s_button.setLongClickHandler(onLongClick);
}

void tick()
{
  s_button.loop();
}

ButtonEvent consumeEvent()
{
  const ButtonEvent event = s_pendingEvent;
  s_pendingEvent = ButtonEvent::None;
  return event;
}

} // namespace input
