#ifndef DHT11_H
#define DHT11_H

#include "AppConfig.h"

namespace dht11
{

void begin();            // 初始化 (DHT_EN=0 时为 no-op)
void readAndRender();    // 读传感器 + 调 screen::drawIndoorTemp (DHT_EN=0 时为 no-op)

} // namespace dht11

#endif // DHT11_H
