#include <doctest.h>

#include "app/WeatherHttpResponseParser.h"

#include <string>

TEST_CASE("weather http response parser extracts status and content headers")
{
  const std::string headerBlock =
    "HTTP/1.1 200 OK\r\n"
    "Content-Type: text/html\r\n"
    "Content-Length: 7121\r\n"
    "Server: openresty\r\n"
    "\r\n";

  app::WeatherHttpResponseHead head;
  CHECK(app::parseWeatherHttpResponseHead(headerBlock, head) == true);
  CHECK(head.statusCode == 200);
  CHECK(head.contentType == "text/html");
  CHECK(head.contentLength == 7121);
  CHECK(head.chunkedTransfer == false);
}

TEST_CASE("weather http response parser detects chunked transfer encoding")
{
  const std::string headerBlock =
    "HTTP/1.1 302 Moved Temporarily\r\n"
    "Transfer-Encoding: chunked\r\n"
    "Content-Type: text/html\r\n"
    "\r\n";

  app::WeatherHttpResponseHead head;
  CHECK(app::parseWeatherHttpResponseHead(headerBlock, head) == true);
  CHECK(head.statusCode == 302);
  CHECK(head.contentType == "text/html");
  CHECK(head.contentLength == -1);
  CHECK(head.chunkedTransfer == true);
}

TEST_CASE("weather http response parser rejects malformed status lines")
{
  app::WeatherHttpResponseHead head;
  CHECK(app::parseWeatherHttpResponseHead("Content-Type: text/plain\r\n\r\n", head) == false);
}
