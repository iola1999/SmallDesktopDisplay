#include "Input.h"

#include <Arduino.h>
#include <Button2.h>

#include "AppConfig.h"
#include "Net.h"

namespace input
{

namespace
{
Button2 s_button(app_config::kPinButton);

void onClick(Button2 &)
{
  ESP.reset();
}

void onLongClick(Button2 &)
{
  net::resetAndRestart();
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

} // namespace input
