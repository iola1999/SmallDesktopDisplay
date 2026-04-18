#ifndef CLI_H
#define CLI_H

#include <string>

namespace cli
{

enum class CommandType
{
  None,
  SetBrightness,
  SetCityCode,
  AutoDetectCity,
  SetRotation,
  SetWeatherUpdateMinutes,
  ResetWifi,
};

struct Command
{
  CommandType type = CommandType::None;
  int value = 0;
  std::string text;
};

bool poll(Command &command);

} // namespace cli

#endif // CLI_H
