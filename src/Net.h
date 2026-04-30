#ifndef NET_H
#define NET_H

#include "app/AppConfigData.h"

namespace net
{

enum class WifiConnectMode
{
  ForegroundBlocking,
  BackgroundSilent,
};

bool connect(app::AppConfigData &config, WifiConnectMode mode);
bool isWifiAwake();
void tick();
void sleep();
void wake();
void restart();
void resetAndRestart();

} // namespace net

#endif // NET_H
