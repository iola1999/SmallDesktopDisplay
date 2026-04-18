#ifndef ADAPTERS_EEPROM_STORAGE_PORT_H
#define ADAPTERS_EEPROM_STORAGE_PORT_H

#include "ports/StoragePort.h"

namespace adapters
{

class EepromStoragePort : public ports::StoragePort
{
public:
  bool load(app::AppConfigData &config) override;
  void save(const app::AppConfigData &config) override;
};

} // namespace adapters

#endif // ADAPTERS_EEPROM_STORAGE_PORT_H
