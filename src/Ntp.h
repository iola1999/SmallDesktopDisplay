#ifndef NTP_H
#define NTP_H

#include <TimeLib.h>

namespace ntp
{

void begin();
time_t syncOnce(); // 同步一次, 返回 epoch 或 0 失败

} // namespace ntp

#endif // NTP_H
