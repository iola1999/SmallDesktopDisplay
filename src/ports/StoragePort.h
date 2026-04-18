#ifndef PORTS_STORAGE_PORT_H
#define PORTS_STORAGE_PORT_H

#include "app/AppConfigData.h"

namespace ports
{

class StoragePort
{
public:
  virtual ~StoragePort() {}
  virtual bool load(app::AppConfigData &config) = 0;
  virtual void save(const app::AppConfigData &config) = 0;
};

} // namespace ports

#endif // PORTS_STORAGE_PORT_H
