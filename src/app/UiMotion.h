#ifndef APP_UI_MOTION_H
#define APP_UI_MOTION_H

#include "AppViewModel.h"

#include <cstddef>
#include <cstdint>

namespace app
{

struct MotionRect
{
  int16_t x = 0;
  int16_t y = 0;
  int16_t width = 0;
  int16_t height = 0;
};

inline bool motionRectEmpty(const MotionRect &rect)
{
  return rect.width <= 0 || rect.height <= 0;
}

inline bool motionRectsIntersect(const MotionRect &left, const MotionRect &right)
{
  if (motionRectEmpty(left) || motionRectEmpty(right))
  {
    return false;
  }

  return left.x < static_cast<int16_t>(right.x + right.width) &&
         right.x < static_cast<int16_t>(left.x + left.width) &&
         left.y < static_cast<int16_t>(right.y + right.height) &&
         right.y < static_cast<int16_t>(left.y + left.height);
}

struct MotionValue
{
  int16_t current = 0;
  int16_t target = 0;
  bool settled = true;
};

inline void snapMotion(MotionValue &value, int16_t target)
{
  value.current = target;
  value.target = target;
  value.settled = true;
}

inline void retargetMotion(MotionValue &value, int16_t target)
{
  value.target = target;
  value.settled = (value.current == target);
}

inline bool advanceMotion(MotionValue &value, uint8_t divisor, int16_t snapDistance)
{
  if (value.current == value.target)
  {
    value.settled = true;
    return false;
  }

  const int32_t delta = static_cast<int32_t>(value.target) - static_cast<int32_t>(value.current);
  const int32_t magnitude = (delta >= 0) ? delta : -delta;
  if (magnitude <= snapDistance)
  {
    value.current = value.target;
    value.settled = true;
    return true;
  }

  const int32_t safeDivisor = (divisor > 0) ? divisor : 1;
  const int32_t step = delta / safeDivisor;
  const int32_t appliedStep = (step == 0) ? (delta > 0 ? 1 : -1) : step;
  value.current = static_cast<int16_t>(static_cast<int32_t>(value.current) + appliedStep);
  value.settled = (value.current == value.target);
  return true;
}

inline int16_t menuBoxYForIndex(std::size_t index)
{
  return static_cast<int16_t>(56 + (index * 38));
}

inline MotionRect menuBodyDirtyRect(std::size_t itemCount)
{
  if (itemCount == 0)
  {
    return {};
  }

  const int16_t top = menuBoxYForIndex(0);
  const int16_t bottom = static_cast<int16_t>(menuBoxYForIndex(itemCount - 1) + 30);
  MotionRect rect;
  rect.x = 16;
  rect.y = top;
  rect.width = 208;
  rect.height = static_cast<int16_t>(bottom - top);
  return rect;
}

inline MotionRect menuSelectionDirtyRect(int16_t previousY, int16_t currentY)
{
  const int16_t top = previousY < currentY ? previousY : currentY;
  const int16_t bottom = previousY > currentY ? previousY : currentY;
  MotionRect rect;
  rect.x = 16;
  rect.y = top;
  rect.width = 208;
  rect.height = static_cast<int16_t>((bottom - top) + 30);
  return rect;
}

inline int16_t infoScrollOffsetForFirstVisible(std::size_t firstVisible)
{
  return static_cast<int16_t>(firstVisible * 36);
}

inline int16_t infoSelectionBoxY(std::size_t firstVisible, std::size_t selected)
{
  const int32_t signedIndex = static_cast<int32_t>(selected) - static_cast<int32_t>(firstVisible);
  return static_cast<int16_t>(52 + (signedIndex * 36));
}

inline MotionRect infoSelectionDirtyRect(int16_t previousY, int16_t currentY)
{
  const int16_t top = previousY < currentY ? previousY : currentY;
  const int16_t bottom = previousY > currentY ? previousY : currentY;
  MotionRect rect;
  rect.x = 14;
  rect.y = top;
  rect.width = 212;
  rect.height = static_cast<int16_t>((bottom - top) + 30);
  return rect;
}

inline MotionRect infoRowsViewportRect()
{
  MotionRect rect;
  rect.x = 14;
  rect.y = 44;
  rect.width = 212;
  rect.height = 180;
  return rect;
}

inline MotionRect infoBodyDirtyRect(int16_t previousScrollOffset,
                                    int16_t currentScrollOffset,
                                    int16_t previousSelectionY,
                                    int16_t currentSelectionY)
{
  if (previousScrollOffset != currentScrollOffset)
  {
    return infoRowsViewportRect();
  }

  return infoSelectionDirtyRect(previousSelectionY, currentSelectionY);
}

inline int16_t adjustFillWidth(int value, int minValue, int maxValue, int totalWidth)
{
  if (totalWidth <= 0 || maxValue <= minValue)
  {
    return 0;
  }

  if (value <= minValue)
  {
    return 0;
  }

  if (value >= maxValue)
  {
    return static_cast<int16_t>(totalWidth);
  }

  const int range = maxValue - minValue;
  const int clampedValue = value < minValue ? minValue : (value > maxValue ? maxValue : value);
  const int adjusted = ((clampedValue - minValue) * totalWidth) / range;
  return static_cast<int16_t>(adjusted);
}

inline bool shouldInvalidateHomeMotionOnViewTransition(ViewKind previousKind, ViewKind nextKind)
{
  return previousKind == ViewKind::Main && nextKind != ViewKind::Main;
}

} // namespace app

#endif // APP_UI_MOTION_H
