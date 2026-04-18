#include "Animate.h"

#include <Arduino.h>
#include <TJpg_Decoder.h>

#include "../AppConfig.h"
#include "../AppState.h"

#if ANIMATE_CHOICE == 1
#include "img/astronaut.h"
#elif ANIMATE_CHOICE == 2
#include "img/hutao.h"
#endif

namespace animate
{

namespace
{
#if ANIMATE_CHOICE != 0
int s_frame = -1;
uint32_t s_lastTick = 0;

#if ANIMATE_CHOICE == 1
constexpr int kTotalFrames = 10;
#elif ANIMATE_CHOICE == 2
constexpr int kTotalFrames = 32;
#endif

void nextFrame(const uint8_t *&buf, uint32_t &size)
{
  s_frame++;
  if (s_frame >= kTotalFrames)
    s_frame = 0;
#if ANIMATE_CHOICE == 1
  buf = astronaut[s_frame];
  size = astronaut[s_frame]; // 注意: 原代码也是传 astronaut[s_frame] 作为大小, 保持兼容
#elif ANIMATE_CHOICE == 2
  buf = hutao[s_frame];
  size = hutao_size[s_frame];
#endif
}
#endif
} // namespace

bool enabled()
{
#if ANIMATE_CHOICE == 0
  return false;
#else
  return g_app.dhtEnabled == 0;
#endif
}

void tick()
{
#if ANIMATE_CHOICE != 0
  if (!enabled())
    return;
  uint32_t now = millis();
  if (now - s_lastTick < app_config::kAnimateFrameIntervalMs)
    return;
  s_lastTick = now;

  const uint8_t *buf = nullptr;
  uint32_t size = 0;
  nextFrame(buf, size);
  if (buf)
    TJpgDec.drawJpg(160, 160, buf, size);
#endif
}

} // namespace animate

// 向后兼容
void imgAnim(const uint8_t **value, uint32_t *size)
{
#if ANIMATE_CHOICE != 0
  const uint8_t *b = nullptr;
  uint32_t s = 0;
  animate::tick();
  (void)b;
  (void)s;
  if (value)
    *value = nullptr;
  if (size)
    *size = 0;
#else
  if (value)
    *value = nullptr;
  if (size)
    *size = 0;
#endif
}
