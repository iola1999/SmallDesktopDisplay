#ifndef APP_APP_CORE_H
#define APP_APP_CORE_H

#include "AppAction.h"
#include "AppConfigData.h"
#include "AppDataCache.h"
#include "AppEvent.h"
#include "AppRuntimeState.h"
#include "AppViewModel.h"
#include "UiSessionState.h"

namespace app
{

class AppCore
{
public:
  AppCore() = default;

  ActionList handle(const AppEvent &event);
  void setConfig(const AppConfigData &config) { config_ = config; }

  const AppRuntimeState &runtime() const { return runtime_; }
  const AppConfigData &config() const { return config_; }
  AppConfigData &configMutable() { return config_; }
  const AppDataCache &cache() const { return cache_; }
  const AppViewModel &view() const { return view_; }
  const UiSessionState &ui() const { return ui_; }

private:
  void enterBlockingError(BlockingErrorReason reason, const char *title, const char *detail);
  void beginHoldFeedback(uint32_t nowMs);
  void armHoldFeedback();
  void clearHoldFeedback();
  void clearToast();
  void resetInfoPage();
  void advanceInfoPage(std::size_t rowCount, std::size_t visibleRowCount);
  void refreshOperationalView();
  void openSettingsMenu();
  void openRebootConfirmMenu();

  AppConfigData config_;
  AppRuntimeState runtime_;
  AppDataCache cache_;
  UiSessionState ui_;
  AppViewModel view_;
};

} // namespace app

#endif // APP_APP_CORE_H
