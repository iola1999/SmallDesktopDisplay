#ifndef PORTS_WEATHER_PORT_H
#define PORTS_WEATHER_PORT_H

#include "app/AppDataCache.h"

#include <string>

namespace ports
{

class WeatherPort
{
public:
  virtual ~WeatherPort() {}
  virtual bool resolveCityCode(std::string &cityCode) = 0;
  virtual bool fetchWeather(const std::string &cityCode, app::WeatherSnapshot &snapshot) = 0;
};

} // namespace ports

#endif // PORTS_WEATHER_PORT_H
