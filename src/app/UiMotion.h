#ifndef APP_UI_MOTION_H
#define APP_UI_MOTION_H

#include <cstddef>
#include <cstdint>

namespace app
{

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

  const int16_t delta = static_cast<int16_t>(value.target - value.current);
  const int16_t magnitude = (delta >= 0) ? delta : static_cast<int16_t>(-delta);
  if (magnitude <= snapDistance)
  {
    value.current = value.target;
    value.settled = true;
    return true;
  }

  const int16_t safeDivisor = static_cast<int16_t>(divisor > 0 ? divisor : 1);
  const int16_t step = static_cast<int16_t>(delta / safeDivisor);
  value.current = static_cast<int16_t>(value.current + (step == 0 ? (delta > 0 ? 1 : -1) : step));
  value.settled = (value.current == value.target);
  return true;
}

inline int16_t menuBoxYForIndex(std::size_t index)
{
  return static_cast<int16_t>(56 + (index * 38));
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

} // namespace app

#endif // APP_UI_MOTION_H
