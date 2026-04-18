#ifndef NTP_H
#define NTP_H

#include <TimeLib.h>

namespace ntp
{

void begin();
bool syncOnce(uint32_t &epochSeconds);

} // namespace ntp

#endif // NTP_H
