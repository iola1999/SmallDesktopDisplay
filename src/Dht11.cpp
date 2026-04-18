#include "Dht11.h"

#include "AppState.h"
#include "Screen.h"

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

void readAndRender()
{
#if DHT_EN
  if (g_app.dhtEnabled == 0)
    return;
  float t = s_dht.readTemperature();
  float h = s_dht.readHumidity();
  screen::drawIndoorTemp(t, h);
#endif
}

} // namespace dht11
