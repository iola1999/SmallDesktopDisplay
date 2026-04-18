/* *****************************************************************
 * SmallDesktopDisplay — 主入口
 *
 * 硬件: ESP8266 (NodeMCU v2 / esp12e)
 * 功能: 时钟、天气、滚动横幅、(可选) DHT11 室内温湿度、(可选) 动图
 *
 * 引脚分配:
 *   SCK   GPIO14
 *   MOSI  GPIO13
 *   RES   GPIO2
 *   DC    GPIO0
 *   LCDBL GPIO5 (见 AppConfig::kPinLcdBacklight)
 *   BTN   GPIO4 (AppConfig::kPinButton)
 *   DHT11 GPIO12 (AppConfig::kPinDht, DHT_EN=1 时才使用)
 *
 * TFT_eSPI 像素引脚由库自身的 User_Setup.h 配置, 不在本仓库内。
 * *****************************************************************/

#include <Arduino.h>
#include <ESP8266WiFi.h>
#include <StaticThreadController.h>
#include <Thread.h>

#include "AppConfig.h"
#include "AppState.h"
#include "Animate/Animate.h"
#include "Cli.h"
#include "Dht11.h"
#include "Display.h"
#include "Input.h"
#include "Net.h"
#include "Ntp.h"
#include "Screen.h"
#include "Storage.h"
#include "Weather.h"

// ============================================================
// 全局状态唯一实例
// ============================================================
AppState g_app;

// ============================================================
// 协程线程
// ============================================================
namespace
{

Thread t_clock;
Thread t_banner;
Thread t_wifiWake;
Thread t_animate;
StaticThreadController<4> g_controller(&t_clock, &t_banner, &t_wifiWake, &t_animate);

void taskClock()
{
  screen::refreshClock();
}

void taskBanner()
{
#if DHT_EN
  dht11::readAndRender();
#endif
  screen::refreshBanner();
}

void taskWakeWifi()
{
  net::wake();
}

void taskAnimate()
{
  animate::tick();
}

void refreshAll()
{
  screen::forceClockRedraw();
  screen::refreshBanner();
  net::wake();
}

} // namespace

void setup()
{
  Serial.begin(115200);
  Serial.println();
  Serial.printf("[%s] booting\n", app_config::kVersion);

  input::begin();
  storage::begin();
  storage::load(g_app);

  display::begin(g_app.lcdRotation);
  display::setBrightness(g_app.lcdBrightness);

#if DHT_EN
  dht11::begin();
#endif

  // 连 WiFi (连不上则进配网)
  net::begin();
  net::ensureConnected();

  Serial.printf("本地 IP: %s\n", WiFi.localIP().toString().c_str());
  ntp::begin();

  // 首次数据拉取
  if (g_app.cityCode.length() < 9)
  {
    String code;
    if (weather::fetchCityCode(code))
      g_app.cityCode = code;
  }

  display::clear();
  display::drawTempHumidityIcons();
  weather::fetchAndRender();
#if DHT_EN
  dht11::readAndRender();
#endif

  net::sleep();

  // 线程周期
  t_clock.setInterval(app_config::kClockRefreshMs);
  t_clock.onRun(taskClock);

  t_banner.setInterval(app_config::kBannerRefreshMs);
  t_banner.onRun(taskBanner);

  t_wifiWake.setInterval(g_app.weatherUpdateMinutes * 60UL * app_config::kTickMs);
  t_wifiWake.onRun(taskWakeWifi);

  t_animate.setInterval(app_config::kAnimateRefreshMs);
  t_animate.onRun(taskAnimate);

  g_controller.run();
}

void loop()
{
  animate::tick();
  if (g_controller.shouldRun())
    g_controller.run();
  net::tickOnlineTasks();
  cli::tick();
  input::tick();
}
