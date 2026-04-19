#ifndef APP_APP_DRIVER_H
#define APP_APP_DRIVER_H

#include "app/AppAction.h"
#include "app/AppConfigData.h"
#include "app/AppViewModel.h"
#include "ports/ClockPort.h"
#include "ports/DisplayPort.h"
#include "ports/NetworkPort.h"
#include "ports/SensorPort.h"
#include "ports/StoragePort.h"
#include "ports/SystemStatusPort.h"
#include "ports/TimeSyncPort.h"
#include "ports/WeatherPort.h"

namespace app
{

class AppCore;

class AppDriver
{
public:
  AppDriver(ports::StoragePort &storage,
            ports::NetworkPort &network,
            ports::WeatherPort &weather,
            ports::TimeSyncPort &timeSync,
            ports::SensorPort &sensor,
            ports::SystemStatusPort &systemStatus,
            ports::DisplayPort &display,
            ports::ClockPort *clock)
    : storage_(storage),
      network_(network),
      weather_(weather),
      timeSync_(timeSync),
      sensor_(sensor),
      systemStatus_(systemStatus),
      display_(display),
      clock_(clock)
  {
  }

  void execute(const ActionList &actions, const AppConfigData &config, const AppViewModel &view);
  void dispatch(AppCore &core, const ActionList &actions);
  void dispatchPending(AppCore &core);
  bool hasPendingActions() const;

private:
  void appendActions(ActionList &target, const ActionList &source);
  bool containsDeferredNetworkStage(const ActionList &actions) const;

  ports::StoragePort &storage_;
  ports::NetworkPort &network_;
  ports::WeatherPort &weather_;
  ports::TimeSyncPort &timeSync_;
  ports::SensorPort &sensor_;
  ports::SystemStatusPort &systemStatus_;
  ports::DisplayPort &display_;
  ports::ClockPort *clock_;
  ActionList pending_;
};

} // namespace app

#endif // APP_APP_DRIVER_H
