#ifndef NET_H
#define NET_H

#include "app/AppAction.h"
#include "app/AppConfigData.h"

namespace net
{

bool connect(app::AppConfigData &config, app::WifiConnectMode mode);
bool isWifiAwake();
void tick();
void sleep();
void wake();
void restart();
void resetAndRestart();

} // namespace net

#endif // NET_H
