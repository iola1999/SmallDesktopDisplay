#include <doctest.h>

#include "remote/DeviceCommand.h"

TEST_CASE("device command parser accepts brightness command json")
{
  remote::DeviceCommand command;

  CHECK(remote::parseDeviceCommand("{\"id\":12,\"type\":\"set_brightness\",\"value\":70,\"persist\":true}", command));
  CHECK(command.id == 12);
  CHECK(command.type == remote::DeviceCommandType::SetBrightness);
  CHECK(command.value == 70);
  CHECK(command.persist);

  CHECK(remote::parseDeviceCommand("{\"id\":13, \"type\": \"set_brightness\", \"value\": 30, \"persist\": false}",
                                   command));
  CHECK(command.id == 13);
  CHECK(command.value == 30);
  CHECK_FALSE(command.persist);
}

TEST_CASE("device command parser rejects unsupported or invalid brightness commands")
{
  remote::DeviceCommand command;

  CHECK_FALSE(remote::parseDeviceCommand("{\"id\":1,\"type\":\"restart\",\"value\":1,\"persist\":true}", command));
  CHECK_FALSE(
      remote::parseDeviceCommand("{\"id\":1,\"type\":\"set_brightness\",\"value\":101,\"persist\":true}", command));
  CHECK_FALSE(
      remote::parseDeviceCommand("{\"id\":0,\"type\":\"set_brightness\",\"value\":50,\"persist\":true}", command));
}
