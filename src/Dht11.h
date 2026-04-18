#ifndef DHT11_H
#define DHT11_H

#include "app/AppDataCache.h"

namespace dht11
{

void begin();
bool read(app::IndoorClimateSnapshot &snapshot);

} // namespace dht11

#endif // DHT11_H
