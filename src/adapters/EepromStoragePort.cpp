#include "adapters/EepromStoragePort.h"

#include "Storage.h"

namespace adapters
{

bool EepromStoragePort::load(app::AppConfigData &config)
{
  storage::begin();
  return storage::loadConfig(config);
}

void EepromStoragePort::save(const app::AppConfigData &config)
{
  storage::begin();
  storage::saveConfig(config);
}

} // namespace adapters
