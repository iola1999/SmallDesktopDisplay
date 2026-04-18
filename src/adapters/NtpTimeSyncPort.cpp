#include "adapters/NtpTimeSyncPort.h"

#include "Ntp.h"

namespace adapters
{

bool NtpTimeSyncPort::sync(uint32_t &epochSeconds)
{
  if (!started_)
  {
    ntp::begin();
    started_ = true;
  }

  return ntp::syncOnce(epochSeconds);
}

} // namespace adapters
