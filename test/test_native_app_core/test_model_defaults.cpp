#include <doctest.h>

#include "app/AppConfigData.h"

TEST_CASE("default config uses firmware defaults for esp12e module")
{
  app::AppConfigData config;
  CHECK(config.lcdBrightness == app_config::kDefaultLcdBrightness);
  CHECK(config.lcdRotation == app_config::kDefaultLcdRotation);
  CHECK(config.remoteBaseUrl == app_config::kDefaultRemoteRenderBaseUrl);
  CHECK(config.remoteDeviceId == app_config::kDefaultRemoteDeviceId);
}

TEST_CASE("remote frame wait parks across one animation frame but stays below gesture windows")
{
  // 长轮询停靠必须跨过服务端动画帧间隔（50ms@20fps），否则排空后的下一次
  // 轮询会在新帧渲染前拿到 204，把 20fps 翻牌拖成 12-16fps 的不均匀步进。
  CHECK(app_config::kRemoteFrameWaitMs > 50);
  // 同时保持明显小于双击窗口：按键在轮询返回后才被采样，停靠时长是手势
  // 识别延迟的上界之一。
  CHECK(app_config::kRemoteFrameWaitMs * 2 <= app_config::kButtonDoubleClickMs);
}
