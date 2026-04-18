#ifndef INPUT_H
#define INPUT_H

namespace input
{

enum class ButtonEvent
{
  None,
  ShortPress,
  LongPress,
};

void begin();
void tick();
ButtonEvent consumeEvent();

} // namespace input

#endif // INPUT_H
