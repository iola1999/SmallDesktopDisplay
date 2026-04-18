#ifndef ADAPTERS_WEATHER_SERVICE_PORT_H
#define ADAPTERS_WEATHER_SERVICE_PORT_H

#include "ports/WeatherPort.h"

namespace adapters
{

class WeatherServicePort : public ports::WeatherPort
{
public:
  bool resolveCityCode(std::string &cityCode) override;
  bool fetchWeather(const std::string &cityCode, app::WeatherSnapshot &snapshot) override;
};

} // namespace adapters

#endif // ADAPTERS_WEATHER_SERVICE_PORT_H
