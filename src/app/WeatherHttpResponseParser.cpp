#include "app/WeatherHttpResponseParser.h"

#include <cctype>

namespace app
{

namespace
{

std::string trim(const std::string &value)
{
  std::size_t start = 0;
  while (start < value.size() && std::isspace(static_cast<unsigned char>(value[start])))
  {
    ++start;
  }

  std::size_t end = value.size();
  while (end > start && std::isspace(static_cast<unsigned char>(value[end - 1])))
  {
    --end;
  }

  return std::string(value.substr(start, end - start));
}

std::string toLower(const std::string &value)
{
  std::string lowered;
  lowered.reserve(value.size());
  for (char ch : value)
  {
    lowered.push_back(static_cast<char>(std::tolower(static_cast<unsigned char>(ch))));
  }
  return lowered;
}

bool parseStatusCode(const std::string &statusLine, int &statusCode)
{
  if (statusLine.rfind("HTTP/", 0) != 0)
  {
    return false;
  }

  const std::size_t firstSpace = statusLine.find(' ');
  if (firstSpace == std::string::npos)
  {
    return false;
  }

  std::size_t index = firstSpace + 1;
  while (index < statusLine.size() && statusLine[index] == ' ')
  {
    ++index;
  }

  if (index + 2 >= statusLine.size() ||
      !std::isdigit(static_cast<unsigned char>(statusLine[index])) ||
      !std::isdigit(static_cast<unsigned char>(statusLine[index + 1])) ||
      !std::isdigit(static_cast<unsigned char>(statusLine[index + 2])))
  {
    return false;
  }

  statusCode = (statusLine[index] - '0') * 100 +
               (statusLine[index + 1] - '0') * 10 +
               (statusLine[index + 2] - '0');
  return true;
}

bool parsePositiveInt(const std::string &text, int &value)
{
  value = 0;
  std::size_t index = 0;
  while (index < text.size() && std::isspace(static_cast<unsigned char>(text[index])))
  {
    ++index;
  }

  const std::size_t digitStart = index;
  while (index < text.size() && std::isdigit(static_cast<unsigned char>(text[index])))
  {
    value = value * 10 + (text[index] - '0');
    ++index;
  }

  return index > digitStart;
}

} // namespace

bool parseWeatherHttpResponseHead(const std::string &headerBlock,
                                  WeatherHttpResponseHead &head)
{
  head = WeatherHttpResponseHead{};

  const std::size_t statusLineEnd = headerBlock.find("\r\n");
  if (statusLineEnd == std::string::npos)
  {
    return false;
  }

  if (!parseStatusCode(headerBlock.substr(0, statusLineEnd), head.statusCode))
  {
    return false;
  }

  const std::size_t headerEnd = headerBlock.find("\r\n\r\n");
  const std::size_t parseLimit =
    headerEnd == std::string::npos ? headerBlock.size() : headerEnd;

  std::size_t lineStart = statusLineEnd + 2;
  while (lineStart < parseLimit)
  {
    const std::size_t lineEnd = headerBlock.find("\r\n", lineStart);
    if (lineEnd == std::string::npos || lineEnd > parseLimit)
    {
      break;
    }

    const std::string line = headerBlock.substr(lineStart, lineEnd - lineStart);
    const std::size_t separator = line.find(':');
    if (separator != std::string::npos)
    {
      const std::string key = toLower(line.substr(0, separator));
      const std::string value = trim(line.substr(separator + 1));

      if (key == "content-type")
      {
        head.contentType = value;
      }
      else if (key == "content-length")
      {
        int parsedLength = 0;
        if (parsePositiveInt(value, parsedLength))
        {
          head.contentLength = parsedLength;
        }
      }
      else if (key == "transfer-encoding")
      {
        head.chunkedTransfer = toLower(value).find("chunked") != std::string::npos;
      }
    }

    lineStart = lineEnd + 2;
  }

  return head.statusCode > 0;
}

} // namespace app
