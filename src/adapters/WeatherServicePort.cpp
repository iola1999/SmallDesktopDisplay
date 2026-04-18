#include "adapters/WeatherServicePort.h"

#include "Weather.h"

namespace adapters
{

bool WeatherServicePort::resolveCityCode(std::string &cityCode)
{
  String code;
  const bool ok = weather::fetchCityCode(code);
  if (ok)
  {
    cityCode = code.c_str();
  }
  return ok;
}

bool WeatherServicePort::fetchWeather(const std::string &cityCode, app::WeatherSnapshot &snapshot)
{
  return weather::fetchWeatherData(String(cityCode.c_str()), snapshot);
}

} // namespace adapters
