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
  Serial.println(F("请输入需要修改的代码："));
  Serial.println(F("亮度设置输入        0x01"));
  Serial.println(F("地址设置输入        0x02"));
  Serial.println(F("屏幕方向设置输入    0x03"));
  Serial.println(F("更改天气更新时间    0x04"));
  Serial.println(F("重置WiFi(会重启)    0x05"));
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
    Serial.println(F("亮度调整错误，请输入 0-100"));
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
    Serial.println(F("城市调整错误，请输入 9 位城市代码，自动获取请输入 0"));
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
    Serial.println(F("屏幕方向值错误，请输入 0-3 内的值"));
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
    Serial.println(F("更新时间太长，请重新设置（1-60）"));
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
    Serial.println(F("请输入亮度值，范围 0-100"));
    return false;
  }
  if (s_pendingMode == "0x02")
  {
    Serial.println(F("请输入 9 位城市代码，自动获取请输入 0"));
    return false;
  }
  if (s_pendingMode == "0x03")
  {
    Serial.println(F("请输入屏幕方向值,"));
    Serial.println(F("0-USB接口朝下"));
    Serial.println(F("1-USB接口朝右"));
    Serial.println(F("2-USB接口朝上"));
    Serial.println(F("3-USB接口朝左"));
    return false;
  }
  if (s_pendingMode == "0x04")
  {
    Serial.println(F("请输入天气更新时间（1-60）分钟"));
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
