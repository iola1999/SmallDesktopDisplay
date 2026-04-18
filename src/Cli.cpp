#include "Cli.h"

#include <Arduino.h>

#include "AppConfig.h"
#include "AppState.h"
#include "Display.h"
#include "Net.h"
#include "Screen.h"
#include "Storage.h"
#include "Weather.h"

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

void handle(const String &line)
{
  if (s_pendingMode == "0x01") // 亮度
  {
    int bl = line.toInt();
    if (bl >= 0 && bl <= 100)
    {
      g_app.lcdBrightness = bl;
      storage::save(g_app);
      display::setBrightness(bl);
      Serial.printf("亮度调整为：%d\n", bl);
    }
    else
      Serial.println(F("亮度调整错误，请输入 0-100"));
    s_pendingMode = "";
    return;
  }
  if (s_pendingMode == "0x02") // 城市
  {
    long cc = line.toInt();
    if ((cc >= 101000000L && cc <= 102000000L) || cc == 0)
    {
      if (cc == 0)
      {
        String code;
        if (weather::fetchCityCode(code))
        {
          g_app.cityCode = code;
          Serial.printf("城市代码(自动)：%s\n", code.c_str());
        }
        else
        {
          Serial.println(F("自动获取失败"));
        }
      }
      else
      {
        char buf[12];
        snprintf(buf, sizeof(buf), "%ld", cc);
        g_app.cityCode = String(buf);
        Serial.printf("城市代码调整为：%s\n", g_app.cityCode.c_str());
      }
      storage::save(g_app);
      weather::fetchAndRender();
    }
    else
      Serial.println(F("城市调整错误，请输入 9 位城市代码，自动获取请输入 0"));
    s_pendingMode = "";
    return;
  }
  if (s_pendingMode == "0x03") // 方向
  {
    int r = line.toInt();
    if (r >= 0 && r <= 3)
    {
      g_app.lcdRotation = r;
      storage::save(g_app);
      display::setRotation(r);
      display::clear();
      screen::forceClockRedraw();
      display::drawTempHumidityIcons();
      Serial.printf("屏幕方向设置为：%d\n", r);
    }
    else
      Serial.println(F("屏幕方向值错误，请输入 0-3 内的值"));
    s_pendingMode = "";
    return;
  }
  if (s_pendingMode == "0x04") // 更新时间
  {
    int m = line.toInt();
    if (m >= 1 && m <= 60)
    {
      g_app.weatherUpdateMinutes = m;
      storage::save(g_app);
      Serial.printf("天气更新时间改为：%d 分钟\n", m);
    }
    else
      Serial.println(F("更新时间太长，请重新设置（1-60）"));
    s_pendingMode = "";
    return;
  }

  s_pendingMode = line;
  if (s_pendingMode == "0x01")
    Serial.println(F("请输入亮度值，范围 0-100"));
  else if (s_pendingMode == "0x02")
    Serial.println(F("请输入 9 位城市代码，自动获取请输入 0"));
  else if (s_pendingMode == "0x03")
  {
    Serial.println(F("请输入屏幕方向值,"));
    Serial.println(F("0-USB接口朝下"));
    Serial.println(F("1-USB接口朝右"));
    Serial.println(F("2-USB接口朝上"));
    Serial.println(F("3-USB接口朝左"));
  }
  else if (s_pendingMode == "0x04")
  {
    Serial.printf("当前天气更新时间：%u 分钟\n", g_app.weatherUpdateMinutes);
    Serial.println(F("请输入天气更新时间（1-60）分钟"));
  }
  else if (s_pendingMode == "0x05")
  {
    Serial.println(F("重置 WiFi 中..."));
    net::resetAndRestart();
  }
  else
  {
    printMenu();
    s_pendingMode = "";
  }
}

} // namespace

void begin()
{
  // no-op
}

void tick()
{
  if (Serial.available() <= 0)
    return;
  String line;
  while (Serial.available() > 0)
  {
    line += char(Serial.read());
    delay(2);
  }
  line.trim();
  if (line.length() > 0)
    handle(line);
}

} // namespace cli
