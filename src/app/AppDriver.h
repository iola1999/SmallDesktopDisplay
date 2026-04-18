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
            ports::DisplayPort &display,
            ports::ClockPort *clock)
    : storage_(storage),
      network_(network),
      weather_(weather),
      timeSync_(timeSync),
      sensor_(sensor),
      display_(display),
      clock_(clock)
  {
  }

  void execute(const ActionList &actions, const AppConfigData &config, const AppViewModel &view);
  void dispatch(AppCore &core, const ActionList &actions);

private:
  void appendActions(ActionList &target, const ActionList &source);

  ports::StoragePort &storage_;
  ports::NetworkPort &network_;
  ports::WeatherPort &weather_;
  ports::TimeSyncPort &timeSync_;
  ports::SensorPort &sensor_;
  ports::DisplayPort &display_;
  ports::ClockPort *clock_;
};

} // namespace app

#endif // APP_APP_DRIVER_H
