#ifndef NET_H
#define NET_H

#include "AppConfig.h"

// ============================================================
// WiFi 生命周期 + 配网 (WM Web 配网 / SmartConfig 二选一)
// ============================================================

namespace net
{

void begin();                // 读取持久化 + 启动 WiFi
bool ensureConnected();      // 连不上则进配网流程 (阻塞)
void sleep();                // WiFi.forceSleepBegin
void wake();                 // WiFi.forceSleepWake

void resetAndRestart();      // 清空 WM + EEPROM WiFi + ESP.restart

void tickOnlineTasks();      // 周期检查 WiFi 连上后拉一次时间+天气再睡
bool awake();

} // namespace net

#endif // NET_H
