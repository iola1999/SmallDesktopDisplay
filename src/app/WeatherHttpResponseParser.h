#pragma once

#include <string>

namespace app
{

struct WeatherHttpResponseHead
{
  int statusCode = 0;
  std::string contentType;
  int contentLength = -1;
  bool chunkedTransfer = false;
};

bool parseWeatherHttpResponseHead(const std::string &headerBlock,
                                  WeatherHttpResponseHead &head);

} // namespace app
