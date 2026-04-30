#ifndef REMOTE_DEVICE_COMMAND_H
#define REMOTE_DEVICE_COMMAND_H

#include <cstdint>
#include <cstdlib>
#include <cstring>

namespace remote
{

enum class DeviceCommandType
{
  None,
  SetBrightness,
};

struct DeviceCommand
{
  uint32_t id = 0;
  DeviceCommandType type = DeviceCommandType::None;
  uint8_t value = 0;
  bool persist = false;
};

inline const char *findJsonField(const char *json, const char *field)
{
  return json == nullptr ? nullptr : std::strstr(json, field);
}

inline bool parseJsonUnsigned(const char *json, const char *field, uint32_t &out)
{
  const char *found = findJsonField(json, field);
  if (found == nullptr)
  {
    return false;
  }

  const char *colon = std::strchr(found, ':');
  if (colon == nullptr)
  {
    return false;
  }

  char *end = nullptr;
  const unsigned long value = std::strtoul(colon + 1, &end, 10);
  if (end == colon + 1)
  {
    return false;
  }

  out = static_cast<uint32_t>(value);
  return true;
}

inline bool parseJsonBool(const char *json, const char *field, bool &out)
{
  const char *found = findJsonField(json, field);
  if (found == nullptr)
  {
    return false;
  }

  const char *colon = std::strchr(found, ':');
  if (colon == nullptr)
  {
    return false;
  }

  const char *value = colon + 1;
  while (*value == ' ')
  {
    ++value;
  }

  if (std::strncmp(value, "true", 4) == 0)
  {
    out = true;
    return true;
  }
  if (std::strncmp(value, "false", 5) == 0)
  {
    out = false;
    return true;
  }
  return false;
}

inline bool parseDeviceCommand(const char *json, DeviceCommand &out)
{
  if (json == nullptr)
  {
    return false;
  }

  const char *typeField = findJsonField(json, "\"type\"");
  if (typeField == nullptr)
  {
    return false;
  }
  const char *typeValue = std::strstr(typeField, "\"set_brightness\"");
  if (typeValue == nullptr)
  {
    return false;
  }

  uint32_t id = 0;
  uint32_t value = 0;
  bool persist = false;
  if (!parseJsonUnsigned(json, "\"id\"", id) || !parseJsonUnsigned(json, "\"value\"", value) ||
      !parseJsonBool(json, "\"persist\"", persist))
  {
    return false;
  }
  if (id == 0 || value > 100)
  {
    return false;
  }

  out.id = id;
  out.type = DeviceCommandType::SetBrightness;
  out.value = static_cast<uint8_t>(value);
  out.persist = persist;
  return true;
}

} // namespace remote

#endif // REMOTE_DEVICE_COMMAND_H
