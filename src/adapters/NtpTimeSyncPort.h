#ifndef ADAPTERS_NTP_TIME_SYNC_PORT_H
#define ADAPTERS_NTP_TIME_SYNC_PORT_H

#include "ports/TimeSyncPort.h"

namespace adapters
{

class NtpTimeSyncPort : public ports::TimeSyncPort
{
public:
  bool sync(uint32_t &epochSeconds) override;

private:
  bool started_ = false;
};

} // namespace adapters

#endif // ADAPTERS_NTP_TIME_SYNC_PORT_H
