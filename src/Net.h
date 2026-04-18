#ifndef NET_H
#define NET_H

#include "app/AppConfigData.h"

namespace net
{

bool connect(app::AppConfigData &config);
void sleep();
void wake();
void resetAndRestart();

} // namespace net

#endif // NET_H
