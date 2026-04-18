#ifndef INPUT_H
#define INPUT_H

namespace input
{

enum class ButtonEvent
{
  None,
  PressStarted,
  LongPressArmed,
  PressReleased,
  ShortPress,
  DoublePress,
  LongPress,
};

void begin();
void tick();
bool pollEvent(ButtonEvent &event);

} // namespace input

#endif // INPUT_H
