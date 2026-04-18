#ifndef WEATHER_H
#define WEATHER_H

#include "app/AppDataCache.h"

#include <WString.h>

namespace weather
{

bool fetchCityCode(String &outCode);
bool fetchWeatherData(const String &cityCode, app::WeatherSnapshot &snapshot);

} // namespace weather

#endif // WEATHER_H
