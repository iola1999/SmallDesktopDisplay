#include "app/WeatherPayloadParser.h"

#include <cctype>

namespace app
{

namespace
{

bool findSection(const std::string &payload,
                 const std::string &startMarker,
                 const std::string &endMarker,
                 std::string &section)
{
  const std::size_t start = payload.find(startMarker);
  if (start == std::string::npos)
  {
    return false;
  }

  const std::size_t contentStart = start + startMarker.size();
  const std::size_t end = payload.find(endMarker, contentStart);
  if (end == std::string::npos || end < contentStart)
  {
    return false;
  }

  section = payload.substr(contentStart, end - contentStart);
  return true;
}

bool extractJsonString(const std::string &object, const std::string &key, std::string &value)
{
  const std::string marker = "\"" + key + "\":\"";
  const std::size_t start = object.find(marker);
  if (start == std::string::npos)
  {
    return false;
  }

  value.clear();
  bool escape = false;
  for (std::size_t index = start + marker.size(); index < object.size(); ++index)
  {
    const char ch = object[index];
    if (escape)
    {
      switch (ch)
      {
        case '"':
        case '\\':
        case '/':
          value.push_back(ch);
          break;

        case 'b':
          value.push_back('\b');
          break;

        case 'f':
          value.push_back('\f');
          break;

        case 'n':
          value.push_back('\n');
          break;

        case 'r':
          value.push_back('\r');
          break;

        case 't':
          value.push_back('\t');
          break;

        default:
          value.push_back(ch);
          break;
      }
      escape = false;
      continue;
    }

    if (ch == '\\')
    {
      escape = true;
      continue;
    }

    if (ch == '"')
    {
      return true;
    }

    value.push_back(ch);
  }

  return false;
}

int parseLeadingInt(const std::string &text)
{
  std::size_t index = 0;
  while (index < text.size() && !std::isdigit(static_cast<unsigned char>(text[index])) && text[index] != '-')
  {
    ++index;
  }

  bool negative = false;
  if (index < text.size() && text[index] == '-')
  {
    negative = true;
    ++index;
  }

  int value = 0;
  bool foundDigit = false;
  while (index < text.size() && std::isdigit(static_cast<unsigned char>(text[index])))
  {
    foundDigit = true;
    value = value * 10 + (text[index] - '0');
    ++index;
  }

  if (!foundDigit)
  {
    return 0;
  }

  return negative ? -value : value;
}

int parseHumidityPercent(const std::string &humidityText)
{
  return parseLeadingInt(humidityText);
}

const char *aqiText(int aqi)
{
  if (aqi > 200)
    return "Severe";
  if (aqi > 150)
    return "Poor";
  if (aqi > 100)
    return "Moderate";
  if (aqi > 50)
    return "Fair";
  return "Good";
}

int parseWeatherCode(const std::string &weatherCodeText)
{
  if (weatherCodeText.size() < 3)
  {
    return 99;
  }

  return parseLeadingInt(weatherCodeText.substr(1, 2));
}

} // namespace

bool parseWeatherPayload(const std::string &payload, WeatherSnapshot &snapshot)
{
  std::string dataSk;
  std::string forecast;
  if (!findSection(payload, "dataSK =", ";var dataZS", dataSk) ||
      !findSection(payload, "\"f\":[", ",{\"fa", forecast))
  {
    return false;
  }

  std::string cityName;
  std::string temperatureText;
  std::string humidityText;
  std::string aqiTextValue;
  std::string weatherCodeText;
  std::string weatherText;
  std::string windDir;
  std::string windSpeed;
  std::string lowTempText;
  std::string highTempText;

  if (!extractJsonString(dataSk, "nameen", cityName) ||
      !extractJsonString(dataSk, "temp", temperatureText) ||
      !extractJsonString(dataSk, "SD", humidityText) ||
      !extractJsonString(dataSk, "aqi", aqiTextValue) ||
      !extractJsonString(dataSk, "weathercode", weatherCodeText) ||
      !extractJsonString(dataSk, "weathere", weatherText) ||
      !extractJsonString(dataSk, "wde", windDir) ||
      !extractJsonString(dataSk, "wse", windSpeed) ||
      !extractJsonString(forecast, "fd", lowTempText) ||
      !extractJsonString(forecast, "fc", highTempText))
  {
    return false;
  }

  snapshot.valid = true;
  snapshot.cityName = cityName;
  snapshot.temperatureText = temperatureText;
  snapshot.humidityText = humidityText;
  snapshot.temperatureC = parseLeadingInt(temperatureText);
  snapshot.humidityPercent = parseHumidityPercent(humidityText);
  snapshot.aqi = parseLeadingInt(aqiTextValue);
  snapshot.weatherCode = parseWeatherCode(weatherCodeText);

  for (std::size_t index = 0; index < snapshot.bannerLines.size(); ++index)
  {
    snapshot.bannerLines[index].clear();
  }

  snapshot.bannerLines[0] = "Now " + weatherText;
  snapshot.bannerLines[1] = std::string("AQI ") + aqiText(snapshot.aqi);
  snapshot.bannerLines[2] = "Wind " + windDir + " " + windSpeed;
  snapshot.bannerLines[3] = "Temp " + temperatureText + "C";
  snapshot.bannerLines[4] = "Low " + lowTempText + "C";
  snapshot.bannerLines[5] = "High " + highTempText + "C";
  return true;
}

} // namespace app
