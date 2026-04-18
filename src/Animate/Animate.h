#ifndef ANIMATE_H
#define ANIMATE_H

// ============================================================
// 右下角动图 (ANIMATE_CHOICE 决定素材)
// ============================================================

namespace animate
{

void tick();    // 按 kAnimateFrameIntervalMs 切帧并绘制
bool enabled(); // ANIMATE_CHOICE != 0 且 DHT 未启用时为 true

} // namespace animate

#endif // ANIMATE_H
