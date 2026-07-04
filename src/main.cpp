#include <Arduino.h>
#include <ESP8266WiFi.h>

#include "AppConfig.h"
#include "Display.h"
#include "Input.h"
#include "Net.h"
#include "Storage.h"
#include "app/DeviceStatusText.h"
#include "app/HoldInteraction.h"
#include "app/HoldProgress.h"
#include "remote/RemoteCommandClient.h"
#include "remote/FrameStreamConsumer.h"
#include "remote/HttpFrameClient.h"
#include "remote/RemoteInputClient.h"
#include "remote/RemoteStatusClient.h"
#include "remote/SerialFrameLink.h"
#include "ui/TftFrameSink.h"

namespace
{

// 传输链路：开机自动探测——串口上有渲染宿主机就走串口（推送模型，零轮询），
// 否则回落 WiFi HTTP 轮询。刻意不提供手动选择；两个方向都能在运行中切换
//（WiFi 模式监听到宿主机 HELLO → 切串口；串口静默且探测无回应 → 回 WiFi）。
enum class LinkMode : uint8_t
{
  SerialLink,
  WifiLink,
};

app::AppConfigData g_config;
ui::TftFrameSink g_frameSink;
remote::FrameStreamConsumer g_frameConsumer(g_frameSink);
remote::HttpFrameClient g_frameClient(g_frameConsumer);
remote::SerialFrameLink g_serialLink(Serial, g_frameConsumer);
remote::RemoteInputClient g_inputClient;
remote::RemoteCommandClient g_commandClient;
remote::RemoteStatusClient g_statusClient;
LinkMode g_linkMode = LinkMode::WifiLink;
uint32_t g_haveFrameId = 0;
uint32_t g_lastCommandId = 0;
uint32_t g_inputSequence = 0;
uint32_t g_lastFramePollMs = 0;
uint32_t g_lastCommandPollMs = 0;
uint32_t g_lastStatusSyncMs = 0;
uint32_t g_lastErrorDrawMs = 0;
uint32_t g_serialProbeSentMs = 0;
uint8_t g_serialProbesLeft = app_config::kSerialProbeAttempts;
bool g_statusSyncPending = true;
bool g_frameErrorShown = false;
app::HoldInteractionState g_holdInteraction;
uint32_t g_holdStartedMs = 0;
uint16_t g_holdLastPixels = UINT16_MAX;

constexpr int16_t kHoldBarX = 18;
constexpr int16_t kHoldBarY = 0;
constexpr uint16_t kHoldBarWidth = 204;
constexpr uint16_t kHoldBarHeight = 5;

void drawStatus(const char *line1, const char *line2, const char *line3 = nullptr)
{
  display::tft.fillScreen(app_config::kColorBg);
  display::tft.setTextDatum(CC_DATUM);
  const int titleY = line3 == nullptr ? 96 : 78;
  const int detailY = line3 == nullptr ? 128 : 116;
  display::tft.setTextColor(TFT_WHITE, app_config::kColorBg);
  display::tft.drawString(line1, 120, titleY, 2);
  display::tft.setTextColor(TFT_YELLOW, app_config::kColorBg);
  display::tft.drawString(line2, 120, detailY, 2);
  if (line3 != nullptr)
  {
    display::tft.setTextColor(TFT_WHITE, app_config::kColorBg);
    display::tft.drawString(line3, 120, 154, 2);
  }
}

std::string currentDeviceIpStatusLine()
{
  if (WiFi.status() != WL_CONNECTED)
  {
    return app::buildDeviceIpStatusLine("");
  }

  const String localIp = WiFi.localIP().toString();
  return app::buildDeviceIpStatusLine(localIp.c_str());
}

const char *eventName(input::ButtonEvent event)
{
  switch (event)
  {
  case input::ButtonEvent::ShortPress:
    return "short_press";

  case input::ButtonEvent::DoublePress:
    return "double_press";

  case input::ButtonEvent::LongPress:
    return "long_press";

  case input::ButtonEvent::None:
  case input::ButtonEvent::PressStarted:
  case input::ButtonEvent::LongPressArmed:
  case input::ButtonEvent::PressReleased:
  default:
    return nullptr;
  }
}

void postRemoteInput(const char *name, uint32_t nowMs)
{
  ++g_inputSequence;
  if (g_linkMode == LinkMode::SerialLink)
  {
    // 串口上行即发即走（无重试）；服务端按 seq/uptime 去重，语义同 HTTP。
    g_serialLink.sendInput(g_inputSequence, name, nowMs);
    Serial.printf("[RemoteInput] serial seq=%lu event=%s\n", static_cast<unsigned long>(g_inputSequence), name);
    return;
  }
  if (g_inputClient.postEvent(g_config.remoteBaseUrl.c_str(), g_config.remoteDeviceId.c_str(), g_inputSequence, name,
                              nowMs))
  {
    Serial.printf("[RemoteInput] posted seq=%lu event=%s\n", static_cast<unsigned long>(g_inputSequence), name);
    return;
  }

  Serial.printf("[RemoteInput] post failed seq=%lu event=%s\n", static_cast<unsigned long>(g_inputSequence), name);
}

void clearHoldOverlay()
{
  display::tft.fillRect(kHoldBarX, kHoldBarY, kHoldBarWidth, kHoldBarHeight, app_config::kColorBg);
  g_holdLastPixels = UINT16_MAX;
}

void updateHoldOverlay(uint32_t nowMs)
{
  if (!g_holdInteraction.active)
  {
    return;
  }

  const uint16_t progress = app::delayedHoldProgressPixels(nowMs - g_holdStartedMs, app_config::kHoldProgressDelayMs,
                                                           app_config::kButtonLongPressMs, kHoldBarWidth);
  if (progress == 0 && g_holdLastPixels == UINT16_MAX)
  {
    return;
  }
  if (progress == g_holdLastPixels)
  {
    return;
  }

  display::tft.fillRect(kHoldBarX, kHoldBarY, kHoldBarWidth, kHoldBarHeight, TFT_DARKGREY);
  if (progress > 0)
  {
    display::tft.fillRect(kHoldBarX, kHoldBarY, progress, kHoldBarHeight, TFT_CYAN);
    app::markHoldOverlayDrawn(g_holdInteraction);
  }
  g_holdLastPixels = progress;
}

void beginHold(uint32_t nowMs)
{
  const app::HoldInteractionAction action = app::applyHoldEvent(g_holdInteraction, app::HoldEvent::PressStarted);
  g_holdStartedMs = nowMs;
  if (action.resetOverlayProgress)
  {
    g_holdLastPixels = UINT16_MAX;
  }
}

void endHold(uint32_t nowMs)
{
  const app::HoldInteractionAction action = app::applyHoldEvent(g_holdInteraction, app::HoldEvent::PressReleased);
  if (action.clearOverlay)
  {
    clearHoldOverlay();
  }
  if (action.postLongPress)
  {
    postRemoteInput("long_press", nowMs);
  }
}

void handleButtonEvent(input::ButtonEvent event, uint32_t nowMs)
{
  switch (event)
  {
  case input::ButtonEvent::PressStarted:
    beginHold(nowMs);
    return;

  case input::ButtonEvent::PressReleased:
    endHold(nowMs);
    return;

  case input::ButtonEvent::LongPressArmed:
    app::applyHoldEvent(g_holdInteraction, app::HoldEvent::LongPressArmed);
    return;

  case input::ButtonEvent::LongPress:
    app::applyHoldEvent(g_holdInteraction, app::HoldEvent::LongPress);
    return;

  case input::ButtonEvent::ShortPress:
  case input::ButtonEvent::DoublePress:
  {
    const char *name = eventName(event);
    if (name != nullptr)
    {
      postRemoteInput(name, nowMs);
    }
    return;
  }

  case input::ButtonEvent::None:
  default:
    return;
  }
}

void processButtonEvents(uint32_t nowMs)
{
  input::ButtonEvent event = input::ButtonEvent::None;
  while (input::pollEvent(event))
  {
    handleButtonEvent(event, nowMs);
  }
}

// 离线提示画的是整屏 banner。服务端恢复后，如果设备已经持有最新帧，轮询只会
// 拿到 204 或零矩形的 partial 帧，都不会覆盖 banner。这里在恢复后的第一次成功
// 轮询把 have 归零，强制下次请求整屏帧覆盖掉离线提示（仅恢复时多取一帧）。
void clearFrameErrorIfRecovered()
{
  if (g_frameErrorShown)
  {
    g_frameErrorShown = false;
    g_haveFrameId = 0;
  }
}

bool pollFrame(uint32_t nowMs)
{
  if (nowMs - g_lastFramePollMs < app_config::kRemoteFramePollMs)
  {
    return true;
  }
  g_lastFramePollMs = nowMs;

  uint32_t nextFrameId = g_haveFrameId;
  const remote::FrameFetchResult result =
      g_frameClient.fetchLatest(g_config.remoteBaseUrl.c_str(), g_config.remoteDeviceId.c_str(), g_haveFrameId,
                                app_config::kRemoteFrameWaitMs, nextFrameId);

  if (result == remote::FrameFetchResult::Updated)
  {
    g_haveFrameId = nextFrameId;
    clearFrameErrorIfRecovered();
    // 排空模式：刚拿到新帧说明服务端可能正在出动画（20fps > 轮询节拍），
    // 让下一轮 loop() 立即再轮询，直到拿到 204 才回到 50ms 节流。
    // 这样动画帧的到达间隔跟随服务端渲染节拍，而不是被轮询相位放大成 50-90ms 抖动。
    g_lastFramePollMs = nowMs - app_config::kRemoteFramePollMs;
    return true;
  }
  if (result == remote::FrameFetchResult::NotModified)
  {
    clearFrameErrorIfRecovered();
    return true;
  }

  if (result == remote::FrameFetchResult::Failed && nowMs - g_lastErrorDrawMs > 3000U)
  {
    g_lastErrorDrawMs = nowMs;
    g_frameErrorShown = true;
    const std::string ipLine = currentDeviceIpStatusLine();
    drawStatus("Render server offline", g_config.remoteBaseUrl.c_str(), ipLine.c_str());
  }
  return false;
}

void applyRemoteCommand(const remote::DeviceCommand &command)
{
  if (command.type != remote::DeviceCommandType::SetBrightness)
  {
    g_lastCommandId = command.id;
    return;
  }

  display::setBrightness(command.value);
  if (command.persist)
  {
    if (g_config.lcdBrightness != command.value)
    {
      g_config.lcdBrightness = command.value;
      storage::saveConfig(g_config);
    }
  }
  else
  {
    g_config.lcdBrightness = command.value;
  }

  g_lastCommandId = command.id;
  g_statusSyncPending = true;
  Serial.printf("[RemoteCommand] applied id=%lu brightness=%u persist=%s\n", static_cast<unsigned long>(command.id),
                command.value, command.persist ? "true" : "false");
}

void pollCommand(uint32_t nowMs)
{
  // 命令通道由帧响应头 X-SDD-Cmd 驱动：只有服务端持有比本地更新的命令时才
  // 真正发起 GET（该请求每次新建 TCP 连接，旧的 100ms 盲轮询会往 20fps 动画
  // 节拍里插入 10-30ms 阻塞）。
  const uint32_t serverCommandId = g_frameClient.latestServerCommandId();
  if (serverCommandId < g_lastCommandId)
  {
    // 服务端重启后命令 id 从头计数：收敛本地水位即可。若服务端仍有一条
    // 旧命令（id 更小），下一轮会走 serverCommandId > g_lastCommandId 分支
    // 重新拉取并应用——set_brightness 幂等，重复应用无害。
    g_lastCommandId = serverCommandId;
    return;
  }
  if (serverCommandId == g_lastCommandId)
  {
    return;
  }
  if (nowMs - g_lastCommandPollMs < app_config::kRemoteCommandPollMs)
  {
    return;
  }
  g_lastCommandPollMs = nowMs;

  remote::DeviceCommand command;
  const remote::CommandFetchResult result = g_commandClient.fetchLatest(
      g_config.remoteBaseUrl.c_str(), g_config.remoteDeviceId.c_str(), g_lastCommandId, command);
  if (result == remote::CommandFetchResult::Updated)
  {
    applyRemoteCommand(command);
  }
}

void syncDeviceStatus(uint32_t nowMs)
{
  if (!g_statusSyncPending && nowMs - g_lastStatusSyncMs < app_config::kRemoteStatusSyncMs)
  {
    return;
  }
  g_lastStatusSyncMs = nowMs;

  const uint32_t heapFree = ESP.getFreeHeap();
  const uint32_t heapMaxBlock = ESP.getMaxFreeBlockSize();
  const uint8_t heapFragmentation = ESP.getHeapFragmentation();
  // 串口模式下 WiFi 关闭，RSSI 无意义，报 0（服务端接受 -127..0）。
  const int16_t wifiRssi = g_linkMode == LinkMode::WifiLink ? WiFi.RSSI() : 0;
  const bool posted =
      g_linkMode == LinkMode::SerialLink
          ? g_serialLink.sendStatus(g_config.lcdBrightness, nowMs, heapFree, heapMaxBlock, heapFragmentation, wifiRssi)
          : g_statusClient.postStatus(g_config.remoteBaseUrl.c_str(), g_config.remoteDeviceId.c_str(),
                                      g_config.lcdBrightness, nowMs, heapFree, heapMaxBlock, heapFragmentation,
                                      wifiRssi);
  if (posted)
  {
    g_statusSyncPending = false;
    Serial.printf("[RemoteStatus] posted brightness=%u heap=%lu max_block=%lu frag=%u%% rssi=%d\n",
                  g_config.lcdBrightness, static_cast<unsigned long>(heapFree),
                  static_cast<unsigned long>(heapMaxBlock), heapFragmentation, wifiRssi);
    return;
  }

  g_statusSyncPending = true;
  Serial.println(F("[RemoteStatus] post failed"));
}

// 串口链路健康检查：首页每秒必有帧，下行静默超过阈值即认为链路断开。
// 先按间隔补发 HELLO 探测；全部无回应后，有 WiFi 凭据则降级 WiFi，
// 没有就守在串口上慢速探测并提示等待宿主机。
void checkSerialLinkHealth(uint32_t nowMs)
{
  const uint32_t idleMs = nowMs - g_serialLink.lastDownlinkMs();
  if (idleMs < app_config::kSerialLinkIdleMs)
  {
    g_serialProbesLeft = app_config::kSerialProbeAttempts;
    return;
  }
  if (nowMs - g_serialProbeSentMs < app_config::kSerialProbeIntervalMs)
  {
    return;
  }
  g_serialProbeSentMs = nowMs;
  if (g_serialProbesLeft > 0)
  {
    --g_serialProbesLeft;
    g_serialLink.sendHello();
    return;
  }

  if (!g_config.wifiSsid.empty())
  {
    Serial.println(F("[Link] serial silent, falling back to WiFi"));
    drawStatus("Serial link lost", "connecting WiFi");
    g_linkMode = LinkMode::WifiLink;
    // HTTP 链路按冷启动重同步（下一帧拿全屏），顺带覆盖状态屏。
    g_haveFrameId = 0;
    g_statusSyncPending = true;
    if (!net::connect(g_config, net::WifiConnectMode::BackgroundSilent))
    {
      // 连不上就留在 WiFi 模式的错误分支提示；被动串口探测仍在跑，
      // 宿主机回来（发 HELLO）会自动切回串口。
      drawStatus("WiFi unavailable", "still probing serial");
    }
    return;
  }

  // 没有 WiFi 凭据可回落：持续慢速探测串口宿主机。
  g_serialLink.sendHello();
  if (nowMs - g_lastErrorDrawMs > 3000U)
  {
    g_lastErrorDrawMs = nowMs;
    drawStatus("Serial host offline", "waiting for host");
  }
}

void serialLoop()
{
  input::tick();
  const uint32_t nowMs = millis();
  processButtonEvents(nowMs);

  // 按住按键期间暂停链路处理（与 WiFi 模式同理，保长按进度条平滑）。
  // 停等协议保证在途最多一帧，4KB RX 缓冲兜得住暂停窗口。
  if (!g_holdInteraction.active)
  {
    const remote::SerialTickResult result = g_serialLink.tick(nowMs, true);
    if (result.hostHelloSeen)
    {
      // 宿主机在探测（服务可能重启过）：回 HELLO 让它重建链路。
      // 重建后 have 归零，恢复的第一帧必是全屏，顺带覆盖可能的离线横幅。
      g_serialLink.sendHello();
    }
    if (result.commandReceived)
    {
      applyRemoteCommand(result.command);
      g_serialLink.sendCommandAck(result.command.id);
    }
    syncDeviceStatus(nowMs);
    checkSerialLinkHealth(nowMs);
  }

  updateHoldOverlay(nowMs);
}

void wifiLoop()
{
  net::tick();
  input::tick();

  const uint32_t nowMs = millis();
  processButtonEvents(nowMs);

  // 被动串口探测：WiFi 模式下持续监听 RX，看到宿主机 HELLO 立即切换串口
  //（acceptContent=false：帧/命令被完整读走丢弃，避免双链路同时画屏）。
  const remote::SerialTickResult probe = g_serialLink.tick(nowMs, false);
  if (probe.hostHelloSeen)
  {
    Serial.println(F("[Link] host hello on serial, switching to serial transport"));
    g_linkMode = LinkMode::SerialLink;
    g_serialLink.sendHello();
    WiFi.mode(WIFI_OFF);
    g_statusSyncPending = true;
    g_serialProbesLeft = app_config::kSerialProbeAttempts;
    return;
  }

  if (WiFi.status() == WL_CONNECTED)
  {
    // 按住按键期间暂停网络轮询：pollFrame 单次会阻塞 10-30ms，导致长按进度条
    // 只能画出 3-4 个台阶。暂停后 loop 以亚毫秒周期运转，进度条按像素级平滑填充；
    // 松手立即恢复轮询（排空模式会自动补上错过的帧）。
    if (!g_holdInteraction.active && pollFrame(nowMs))
    {
      pollCommand(nowMs);
      syncDeviceStatus(nowMs);
    }
  }
  else if (nowMs - g_lastErrorDrawMs > 3000U)
  {
    g_lastErrorDrawMs = nowMs;
    drawStatus("WiFi disconnected", "waiting");
  }

  updateHoldOverlay(nowMs);
}

} // namespace

void setup()
{
  // 串口既是日志口也是潜在的帧传输口：先扩大 RX 缓冲再 begin。
  // 波特率统一 921600（开发监视器同步：pio device monitor -b 921600）。
  Serial.setRxBufferSize(app_config::kSerialRxBufferBytes);
  Serial.begin(app_config::kSerialBaud);
  Serial.println();
  Serial.printf("[%s] remote display boot\n", app_config::kVersion);

  // 所有 TCP 连接默认关闭 Nagle：帧轮询/命令/状态都是小包一问一答，
  // Nagle 与对端 delayed-ACK 的相互等待只会放大延迟抖动。
  WiFiClient::setDefaultNoDelay(true);
  // 阻止 SDK 把 WiFi 模式/凭据写回 flash：凭据权威在 EEPROM 配置里，
  // 串口模式每次开机 WIFI_OFF 不应磨损 flash。
  WiFi.persistent(false);

  storage::begin();
  storage::loadConfig(g_config);

  input::begin();
  display::begin(g_config.lcdRotation);
  display::setBrightness(g_config.lcdBrightness);

  // 串口自动探测：发 HELLO，在窗口内等宿主机的任何合法信封（探测 HELLO，
  // 或宿主机对我们 HELLO 的回应——直接推来的第一帧）。检测到 → 串口模式并
  // 完全跳过 WiFi；超时 → WiFi 模式。刻意不提供手动选择：插上宿主机 USB
  // 即串口，拔掉后重启（或静默降级）回 WiFi。
  g_serialLink.begin(g_config.remoteDeviceId.c_str());
  drawStatus("Detecting link", "serial probe");
  g_serialLink.sendHello();
  bool serialFrameDrawn = false;
  const uint32_t detectStartedMs = millis();
  while (millis() - detectStartedMs < app_config::kSerialDetectWindowMs)
  {
    const remote::SerialTickResult result = g_serialLink.tick(millis(), true);
    if (result.hostHelloSeen)
    {
      g_serialLink.sendHello();
    }
    if (result.frameDrawn)
    {
      serialFrameDrawn = true;
    }
    if (result.sawValidEnvelope)
    {
      g_linkMode = LinkMode::SerialLink;
      break;
    }
    delay(2);
  }

  if (g_linkMode == LinkMode::SerialLink)
  {
    Serial.printf("[Link] serial transport active baud=%lu\n", static_cast<unsigned long>(app_config::kSerialBaud));
    WiFi.mode(WIFI_OFF);
    if (!serialFrameDrawn)
    {
      drawStatus("Serial link", "waiting frames");
    }
    return;
  }

  Serial.println(F("[Link] no serial host, using WiFi"));
  drawStatus("Connecting WiFi", g_config.wifiSsid.empty() ? "setup portal" : g_config.wifiSsid.c_str());

  if (!net::connect(g_config, net::WifiConnectMode::ForegroundBlocking))
  {
    drawStatus("WiFi unavailable", "open setup portal");
    return;
  }

  Serial.printf("[Remote] server=%s device=%s ip=%s\n", g_config.remoteBaseUrl.c_str(), g_config.remoteDeviceId.c_str(),
                WiFi.localIP().toString().c_str());
  const std::string ipLine = currentDeviceIpStatusLine();
  drawStatus("Remote renderer", g_config.remoteBaseUrl.c_str(), ipLine.c_str());
}

void loop()
{
  if (g_linkMode == LinkMode::SerialLink)
  {
    serialLoop();
    return;
  }
  wifiLoop();
}
