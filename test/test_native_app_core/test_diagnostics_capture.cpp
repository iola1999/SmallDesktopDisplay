#include <doctest.h>

#include "app/AppCore.h"
#include "app/AppDriver.h"

namespace
{

app::AppCore diagnosticsCore()
{
  app::AppCore core;
  core.handle(app::AppEvent::bootRequested());
  core.handle(app::AppEvent::wifiConnected());
  core.handle(app::AppEvent::timeSynced(1710000000));

  app::WeatherSnapshot weather;
  weather.valid = true;
  weather.cityName = "Shijiazhuang";
  weather.temperatureText = "26";
  weather.humidityText = "40%";
  weather.temperatureC = 26;
  weather.humidityPercent = 40;
  weather.aqi = 42;
  weather.weatherCode = 1;
  core.handle(app::AppEvent::weatherFetched(weather, 1710000000));
  return core;
}

struct FakeSystemStatusPort : ports::SystemStatusPort
{
  app::DiagnosticsSnapshot capture(const app::AppConfigData &config,
                                   const app::AppRuntimeState &runtime) const override
  {
    app::DiagnosticsSnapshot snapshot;
    snapshot.valid = true;
    snapshot.savedWifiSsid = config.wifiSsid;
    snapshot.activeWifiSsid = runtime.backgroundSyncInProgress ? "BackgroundSSID" : "-";
    snapshot.wifiLocalIp = runtime.backgroundSyncInProgress ? "192.168.1.50" : "disconnected";
    snapshot.wifiLinkConnected = runtime.backgroundSyncInProgress;
    snapshot.wifiRadioAwake = runtime.backgroundSyncInProgress;
    snapshot.lastWeatherSyncEpoch = runtime.lastWeatherSyncEpoch;
    snapshot.refreshIntervalMinutes = config.weatherUpdateMinutes;
    snapshot.ramTotalBytes = 81920;
    snapshot.freeHeapBytes = 1111;
    snapshot.maxFreeBlockBytes = 777;
    snapshot.heapFragmentationPercent = 23;
    snapshot.programFlashUsedBytes = 2222;
    snapshot.programFlashTotalBytes = 3333;
    return snapshot;
  }
};

struct FakeDisplayPort : ports::DisplayPort
{
  void render(const app::AppViewModel &) override {}
  void setBrightness(uint8_t) override {}
};

struct FakeNetworkPort : ports::NetworkPort
{
  bool restartCalled = false;

  bool connect(app::AppConfigData &, app::WifiConnectMode) override
  {
    return true;
  }

  void wake() override {}
  void sleep() override {}
  void restart() override
  {
    restartCalled = true;
  }
  void resetAndRestart() override {}
};

struct NullStoragePort : ports::StoragePort
{
  bool load(app::AppConfigData &) override
  {
    return false;
  }

  void save(const app::AppConfigData &) override {}
};

struct NullWeatherPort : ports::WeatherPort
{
  bool resolveCityCode(std::string &) override
  {
    return false;
  }

  bool fetchWeather(const std::string &, app::WeatherSnapshot &) override
  {
    return false;
  }
};

struct NullTimeSyncPort : ports::TimeSyncPort
{
  bool sync(uint32_t &) override
  {
    return false;
  }
};

} // namespace

TEST_CASE("diagnostics menu entry requests a single captured snapshot")
{
  auto core = diagnosticsCore();
  core.handle(app::AppEvent::longPressed(1000));

  const auto actions = core.handle(app::AppEvent::longPressed(1001));

  CHECK(actions.count == 1);
  CHECK(actions[0].type == app::AppActionType::CaptureDiagnosticsSnapshot);
}

TEST_CASE("captured snapshot renders the diagnostics info page")
{
  auto core = diagnosticsCore();
  core.handle(app::AppEvent::longPressed(1000));
  core.handle(app::AppEvent::longPressed(1001));

  app::DiagnosticsSnapshot snapshot;
  snapshot.valid = true;
  snapshot.savedWifiSsid = "StudioWiFi";
  snapshot.activeWifiSsid = "-";
  snapshot.wifiLocalIp = "disconnected";
  snapshot.wifiLinkConnected = false;
  snapshot.wifiRadioAwake = false;
  snapshot.lastWeatherSyncEpoch = 1710000000;
  snapshot.refreshIntervalMinutes = 15;
  snapshot.ramTotalBytes = 81920;
  snapshot.freeHeapBytes = 32768;
  snapshot.maxFreeBlockBytes = 24576;
  snapshot.heapFragmentationPercent = 11;
  snapshot.programFlashUsedBytes = 846012;
  snapshot.programFlashTotalBytes = 1044464;

  const auto actions = core.handle(app::AppEvent::diagnosticsSnapshotCaptured(snapshot));

  CHECK(actions.count == 1);
  CHECK(actions[0].type == app::AppActionType::RenderRequested);
  CHECK(core.ui().route == app::UiRoute::DiagnosticsPage);
  CHECK(core.view().main.pageKind == app::OperationalPageKind::Info);
  CHECK(core.view().main.info.rowCount == 13);
  CHECK(core.view().main.info.visibleRowCount == 4);
  CHECK(core.view().main.info.rows[0].label == "Saved SSID");
  CHECK(core.view().main.info.rows[1].value == "sleeping");
  CHECK(core.view().main.info.rows[4].label == "LAN IP");
  CHECK(core.view().main.info.rows[4].value == "disconnected");
  CHECK(core.view().main.info.rows[5].label == "Last Sync");
  CHECK(core.view().main.info.rows[7].label == "RAM Total");
  CHECK(core.view().main.info.rows[7].value == "81920");
  CHECK(core.view().main.info.rows[8].label == "Free Heap");
  CHECK(core.view().main.info.rows[8].value == "32768");
  CHECK(core.view().main.info.rows[9].label == "Max Block");
  CHECK(core.view().main.info.rows[9].value == "24576");
  CHECK(core.view().main.info.rows[10].label == "Heap Frag");
  CHECK(core.view().main.info.rows[10].value == "11%");
}

TEST_CASE("content-page short press scrolls and long press returns")
{
  auto core = diagnosticsCore();
  core.handle(app::AppEvent::longPressed(1000));
  core.handle(app::AppEvent::longPressed(1001));

  app::DiagnosticsSnapshot snapshot;
  snapshot.valid = true;
  snapshot.savedWifiSsid = "StudioWiFi";
  snapshot.activeWifiSsid = "-";
  snapshot.wifiLocalIp = "disconnected";
  snapshot.wifiLinkConnected = false;
  snapshot.wifiRadioAwake = false;
  snapshot.lastWeatherSyncEpoch = 1710000000;
  snapshot.refreshIntervalMinutes = 15;
  snapshot.ramTotalBytes = 81920;
  snapshot.freeHeapBytes = 32768;
  snapshot.maxFreeBlockBytes = 24576;
  snapshot.heapFragmentationPercent = 11;
  snapshot.programFlashUsedBytes = 846012;
  snapshot.programFlashTotalBytes = 1044464;
  core.handle(app::AppEvent::diagnosticsSnapshotCaptured(snapshot));

  core.handle(app::AppEvent::shortPressed(1000));
  core.handle(app::AppEvent::shortPressed(1001));
  core.handle(app::AppEvent::shortPressed(1002));
  core.handle(app::AppEvent::shortPressed(1003));

  CHECK(core.ui().infoPage.selectedRowIndex == 4);
  CHECK(core.ui().infoPage.firstVisibleRowIndex == 1);

  const auto back = core.handle(app::AppEvent::longPressed(1004));
  CHECK(back.count == 1);
  CHECK(back[0].type == app::AppActionType::RenderRequested);
  CHECK(core.ui().route == app::UiRoute::SettingsMenu);
}

TEST_CASE("driver dispatch captures diagnostics with config and runtime context")
{
  FakeDisplayPort display;
  FakeNetworkPort network;
  NullStoragePort storage;
  NullWeatherPort weather;
  NullTimeSyncPort timeSync;
  FakeSystemStatusPort systemStatus;
  app::AppCore core = diagnosticsCore();
  core.configMutable().wifiSsid = "StudioWiFi";
  core.configMutable().weatherUpdateMinutes = 15;
  app::AppDriver driver(storage, network, weather, timeSync, systemStatus, display, nullptr);

  app::ActionList diagnostics;
  diagnostics.push(app::AppActionType::CaptureDiagnosticsSnapshot);
  driver.dispatch(core, diagnostics);
  CHECK(core.ui().route == app::UiRoute::DiagnosticsPage);
  CHECK(core.view().main.info.rows[0].value == "StudioWiFi");
  CHECK(core.view().main.info.rows[4].value == "disconnected");
  CHECK(core.view().main.info.rows[6].value == "15m");
  CHECK(core.view().main.info.rows[7].value == "81920");
  CHECK(core.view().main.info.rows[8].value == "1111");
  CHECK(core.view().main.info.rows[9].value == "777");
  CHECK(core.view().main.info.rows[10].value == "23%");

  app::ActionList restart;
  restart.push(app::AppActionType::RestartDevice);
  driver.dispatch(core, restart);
  CHECK(network.restartCalled == true);
}
