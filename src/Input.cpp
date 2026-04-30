#include "Input.h"

#include <array>
#include <cstddef>

#include <Button2.h>

#include "AppConfig.h"

namespace input
{

namespace
{

Button2 s_button(app_config::kPinButton);
std::array<ButtonEvent, 8> s_queue{};
std::size_t s_head = 0;
std::size_t s_tail = 0;

void pushEvent(ButtonEvent event)
{
  const std::size_t next = (s_head + 1U) % s_queue.size();
  if (next == s_tail)
  {
    return;
  }

  s_queue[s_head] = event;
  s_head = next;
}

void onPressed(Button2 &)
{
  pushEvent(ButtonEvent::PressStarted);
}

void onReleased(Button2 &)
{
  pushEvent(ButtonEvent::PressReleased);
}

void onClick(Button2 &)
{
  pushEvent(ButtonEvent::ShortPress);
}

void onDoubleClick(Button2 &)
{
  pushEvent(ButtonEvent::DoublePress);
}

void onLongDetected(Button2 &)
{
  pushEvent(ButtonEvent::LongPressArmed);
}

void onLongClick(Button2 &)
{
  pushEvent(ButtonEvent::LongPress);
}

} // namespace

void begin()
{
  s_button.begin(app_config::kPinButton);
  s_button.setLongClickTime(app_config::kButtonLongPressMs);
  s_button.setPressedHandler(onPressed);
  s_button.setReleasedHandler(onReleased);
  s_button.setClickHandler(onClick);
  s_button.setDoubleClickHandler(onDoubleClick);
  s_button.setLongClickDetectedHandler(onLongDetected);
  s_button.setLongClickHandler(onLongClick);
}

void tick()
{
  s_button.loop();
}

bool pollEvent(ButtonEvent &event)
{
  if (s_head == s_tail)
  {
    event = ButtonEvent::None;
    return false;
  }

  event = s_queue[s_tail];
  s_tail = (s_tail + 1U) % s_queue.size();
  return true;
}

} // namespace input
