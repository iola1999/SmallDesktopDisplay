#include "Dht11.h"

#include "AppConfig.h"

#include <math.h>

#if DHT_EN
#include <DHT.h>

namespace
{
DHT s_dht(app_config::kPinDht, DHT11);
}
#endif

namespace dht11
{

void begin()
{
#if DHT_EN
  s_dht.begin();
#endif
}

bool read(app::IndoorClimateSnapshot &snapshot)
{
#if DHT_EN
  float t = s_dht.readTemperature();
  float h = s_dht.readHumidity();
  if (isnan(t) || isnan(h))
    return false;
  snapshot.valid = true;
  snapshot.temperatureC = t;
  snapshot.humidityPercent = h;
  return true;
#else
  (void)snapshot;
  return false;
#endif
}

} // namespace dht11
