#include "Cli.h"

#include <Arduino.h>

namespace cli
{

namespace
{

String s_pendingMode;

void printMenu()
{
  Serial.println();
  Serial.println(F("Enter the setting code:"));
  Serial.println(F("Brightness          0x01"));
  Serial.println(F("City code           0x02"));
  Serial.println(F("Screen rotation     0x03"));
  Serial.println(F("Weather interval    0x04"));
  Serial.println(F("Reset WiFi          0x05"));
  Serial.println();
}

bool handlePendingValue(const String &line, Command &command)
{
  if (s_pendingMode == "0x01")
  {
    const int brightness = line.toInt();
    if (brightness >= 0 && brightness <= 100)
    {
      command.type = CommandType::SetBrightness;
      command.value = brightness;
      s_pendingMode = "";
      return true;
    }
    Serial.println(F("Invalid brightness. Enter 0-100."));
    s_pendingMode = "";
    return false;
  }

  if (s_pendingMode == "0x02")
  {
    const long cityCode = line.toInt();
    if ((cityCode >= 101000000L && cityCode <= 102000000L) || cityCode == 0)
    {
      command.type = cityCode == 0 ? CommandType::AutoDetectCity : CommandType::SetCityCode;
      if (cityCode != 0)
      {
        char buffer[12];
        snprintf(buffer, sizeof(buffer), "%ld", cityCode);
        command.text = buffer;
      }
      s_pendingMode = "";
      return true;
    }
    Serial.println(F("Invalid city code. Enter 9 digits, or 0 for auto detect."));
    s_pendingMode = "";
    return false;
  }

  if (s_pendingMode == "0x03")
  {
    const int rotation = line.toInt();
    if (rotation >= 0 && rotation <= 3)
    {
      command.type = CommandType::SetRotation;
      command.value = rotation;
      s_pendingMode = "";
      return true;
    }
    Serial.println(F("Invalid rotation. Enter a value from 0 to 3."));
    s_pendingMode = "";
    return false;
  }

  if (s_pendingMode == "0x04")
  {
    const int minutes = line.toInt();
    if (minutes >= 1 && minutes <= 60)
    {
      command.type = CommandType::SetWeatherUpdateMinutes;
      command.value = minutes;
      s_pendingMode = "";
      return true;
    }
    Serial.println(F("Invalid update interval. Enter 1-60 minutes."));
    s_pendingMode = "";
    return false;
  }

  return false;
}

bool handleLine(const String &line, Command &command)
{
  command = Command{};

  if (s_pendingMode.length() > 0)
  {
    return handlePendingValue(line, command);
  }

  s_pendingMode = line;
  if (s_pendingMode == "0x01")
  {
    Serial.println(F("Enter brightness in the range 0-100."));
    return false;
  }
  if (s_pendingMode == "0x02")
  {
    Serial.println(F("Enter a 9-digit city code, or 0 for auto detect."));
    return false;
  }
  if (s_pendingMode == "0x03")
  {
    Serial.println(F("Enter the screen rotation value:"));
    Serial.println(F("0 - USB down"));
    Serial.println(F("1 - USB right"));
    Serial.println(F("2 - USB up"));
    Serial.println(F("3 - USB left"));
    return false;
  }
  if (s_pendingMode == "0x04")
  {
    Serial.println(F("Enter the weather update interval in minutes (1-60)."));
    return false;
  }
  if (s_pendingMode == "0x05")
  {
    command.type = CommandType::ResetWifi;
    s_pendingMode = "";
    return true;
  }

  printMenu();
  s_pendingMode = "";
  return false;
}

} // namespace

bool poll(Command &command)
{
  if (Serial.available() <= 0)
    return false;

  String line;
  while (Serial.available() > 0)
  {
    line += char(Serial.read());
    delay(2);
  }
  line.trim();
  if (line.length() == 0)
    return false;

  return handleLine(line, command);
}

} // namespace cli
