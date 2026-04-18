#ifndef APP_APP_CORE_H
#define APP_APP_CORE_H

#include "AppAction.h"
#include "AppConfigData.h"
#include "AppDataCache.h"
#include "AppEvent.h"
#include "AppRuntimeState.h"
#include "AppViewModel.h"

namespace app
{

class AppCore
{
public:
  AppCore() = default;

  ActionList handle(const AppEvent &event);

  const AppRuntimeState &runtime() const { return runtime_; }
  const AppConfigData &config() const { return config_; }
  const AppDataCache &cache() const { return cache_; }
  const AppViewModel &view() const { return view_; }

private:
  void enterBlockingError(BlockingErrorReason reason, const char *title, const char *detail);
  void refreshMainView();

  AppConfigData config_;
  AppRuntimeState runtime_;
  AppDataCache cache_;
  AppViewModel view_;
};

} // namespace app

#endif // APP_APP_CORE_H
