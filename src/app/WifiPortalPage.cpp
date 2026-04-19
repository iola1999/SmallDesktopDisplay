#include "app/WifiPortalPage.h"

#include <algorithm>
#include <cctype>
#include <sstream>

namespace app
{

namespace
{

std::string trimCopy(const std::string &input)
{
  std::size_t start = 0;
  while (start < input.size() && std::isspace(static_cast<unsigned char>(input[start])))
  {
    ++start;
  }

  std::size_t end = input.size();
  while (end > start && std::isspace(static_cast<unsigned char>(input[end - 1])))
  {
    --end;
  }

  return input.substr(start, end - start);
}

bool isNineDigitCityCode(const std::string &input)
{
  if (input.size() != 9)
  {
    return false;
  }

  return std::all_of(input.begin(), input.end(), [](char ch) {
    return std::isdigit(static_cast<unsigned char>(ch)) != 0;
  });
}

std::string escapeHtml(const std::string &input)
{
  std::string escaped;
  escaped.reserve(input.size() + 16);

  for (char ch : input)
  {
    switch (ch)
    {
      case '&':
        escaped += "&amp;";
        break;
      case '<':
        escaped += "&lt;";
        break;
      case '>':
        escaped += "&gt;";
        break;
      case '"':
        escaped += "&quot;";
        break;
      case '\'':
        escaped += "&#39;";
        break;
      default:
        escaped.push_back(ch);
        break;
    }
  }

  return escaped;
}

} // namespace

std::string normalizeCityCodeInput(const std::string &input)
{
  const std::string trimmed = trimCopy(input);
  if (trimmed.empty() || trimmed == "0")
  {
    return "";
  }

  return isNineDigitCityCode(trimmed) ? trimmed : "";
}

std::string buildWifiPortalPage(const std::string &apSsid,
                                const std::string &portalIp,
                                const std::vector<WifiPortalNetwork> &networks,
                                const std::string &selectedSsid,
                                const std::string &cityCode,
                                const std::string &message)
{
  std::ostringstream html;
  html << "<!doctype html><html><head>"
       << "<meta name='viewport' content='width=device-width,initial-scale=1'>"
       << "<title>SmallDesktopDisplay WiFi Setup</title>"
       << "</head><body style='font-family:sans-serif;background:#111;color:#eee;padding:16px'>"
       << "<h2>SmallDesktopDisplay WiFi Setup</h2>";

  if (!apSsid.empty())
  {
    html << "<p>Connect to AP <b>" << escapeHtml(apSsid) << "</b> and open <b>"
         << escapeHtml(portalIp) << "</b>.</p>";
  }
  else
  {
    html << "<p>Open <b>" << escapeHtml(portalIp)
         << "</b> from any device on the same LAN.</p>";
  }

  if (!message.empty())
  {
    html << "<p><b>" << escapeHtml(message) << "</b></p>";
  }

  html << "<h3>Nearby WiFi</h3><ul>";
  if (networks.empty())
  {
    html << "<li>No scan results yet</li>";
  }
  else
  {
    for (const auto &network : networks)
    {
      html << "<li><button type='button' data-ssid='" << escapeHtml(network.ssid)
           << "' onclick=\"document.getElementById('ssid').value=this.dataset.ssid\">"
           << escapeHtml(network.ssid) << "</button> "
           << "(" << network.rssi << " dBm";
      if (network.encrypted)
      {
        html << ", lock";
      }
      else
      {
        html << ", open";
      }
      html << ")</li>";
    }
  }
  html << "</ul>";

  html << "<form method='post' action='/save'>"
       << "<p><label>SSID<br><input id='ssid' name='ssid' maxlength='31' style='width:100%;padding:10px' value='"
       << escapeHtml(selectedSsid) << "'></label></p>"
       << "<p><label>Password<br><input name='psk' type='password' maxlength='63' style='width:100%;padding:10px'></label></p>"
       << "<p><label>City code<br><input name='CityCode' maxlength='9' style='width:100%;padding:10px' value='"
       << escapeHtml(cityCode) << "'></label></p>"
       << "<p>0 or blank = auto detect</p>"
       << "<p><button type='submit' style='padding:10px 14px'>Save and Restart</button></p>"
       << "</form></body></html>";

  return html.str();
}

} // namespace app
