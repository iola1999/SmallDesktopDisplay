#ifndef ANIMATE_NEW_H
#define ANIMATE_NEW_H

#include <stdint.h>

// ============================================================
// 右下角动图 (ANIMATE_CHOICE 决定素材)
// ============================================================

namespace animate
{

void tick();   // 按 kAnimateFrameIntervalMs 切帧并绘制
bool enabled(); // ANIMATE_CHOICE != 0 且 DHT 未启用时为 true

} // namespace animate

// 兼容旧接口 (保持现有 Animate.h 的声明继续可编译)
void imgAnim(const uint8_t **value, uint32_t *size);

#endif // ANIMATE_NEW_H
