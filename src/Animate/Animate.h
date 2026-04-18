#ifndef ANIMATE_H
#define ANIMATE_H

// ============================================================
// 右下角动图 (ANIMATE_CHOICE 决定素材)
// ============================================================

namespace animate
{

void setDhtEnabled(bool enabled);
void setHomeActive(bool active);
void tick();
bool enabled();

} // namespace animate

#endif // ANIMATE_H
