#ifndef APP_WEATHER_PAYLOAD_PARSER_H
#define APP_WEATHER_PAYLOAD_PARSER_H

#include "app/AppDataCache.h"

#include <string>

namespace app
{

bool parseWeatherPayload(const std::string &payload, WeatherSnapshot &snapshot);

} // namespace app

#endif // APP_WEATHER_PAYLOAD_PARSER_H
