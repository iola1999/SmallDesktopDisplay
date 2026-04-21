#ifndef APP_RENDER_PLAN_H
#define APP_RENDER_PLAN_H

#include "AppViewModel.h"

namespace app
{

enum class RenderRegion
{
  FullScreen,
  MenuBody,
  InfoBody,
  AdjustBody,
};

struct RenderPlan
{
  RenderRegion region = RenderRegion::FullScreen;
};

inline RenderPlan makeRenderPlan(RenderRegion region)
{
  RenderPlan plan;
  plan.region = region;
  return plan;
}

inline bool sameFooterHints(const FooterHints &left, const FooterHints &right)
{
  return left.shortPressLabel == right.shortPressLabel &&
         left.longPressLabel == right.longPressLabel &&
         left.doublePressLabel == right.doublePressLabel;
}

inline bool sameMenuStructure(const MenuBodyData &left, const MenuBodyData &right)
{
  if (left.title != right.title ||
      left.subtitle != right.subtitle ||
      left.itemCount != right.itemCount)
  {
    return false;
  }

  for (std::size_t index = 0; index < left.itemCount; ++index)
  {
    if (left.items[index].label != right.items[index].label)
    {
      return false;
    }
  }

  return true;
}

inline bool sameInfoStructure(const InfoBodyData &left, const InfoBodyData &right)
{
  if (left.title != right.title ||
      left.subtitle != right.subtitle ||
      left.rowCount != right.rowCount ||
      left.visibleRowCount != right.visibleRowCount)
  {
    return false;
  }

  for (std::size_t index = 0; index < left.rowCount; ++index)
  {
    if (left.rows[index].label != right.rows[index].label)
    {
      return false;
    }
  }

  return true;
}

inline bool sameAdjustStructure(const AdjustBodyData &left, const AdjustBodyData &right)
{
  return left.title == right.title &&
         left.subtitle == right.subtitle &&
         left.minValue == right.minValue &&
         left.maxValue == right.maxValue &&
         left.unit == right.unit;
}

inline RenderPlan planRender(bool hasPrevious,
                             const AppViewModel &previous,
                             const AppViewModel &next)
{
  if (!hasPrevious || previous.kind != next.kind)
  {
    return {};
  }

  if (next.kind != ViewKind::Main || previous.main.pageKind != next.main.pageKind)
  {
    return {};
  }

  if (!sameFooterHints(previous.main.footer, next.main.footer))
  {
    return {};
  }

  switch (next.main.pageKind)
  {
    case OperationalPageKind::Menu:
      if (sameMenuStructure(previous.main.menu, next.main.menu))
      {
        return makeRenderPlan(RenderRegion::MenuBody);
      }
      break;

    case OperationalPageKind::Info:
      if (sameInfoStructure(previous.main.info, next.main.info))
      {
        return makeRenderPlan(RenderRegion::InfoBody);
      }
      break;

    case OperationalPageKind::Adjust:
      if (sameAdjustStructure(previous.main.adjust, next.main.adjust))
      {
        return makeRenderPlan(RenderRegion::AdjustBody);
      }
      break;

    case OperationalPageKind::Home:
      break;
  }

  return {};
}

} // namespace app

#endif // APP_RENDER_PLAN_H
