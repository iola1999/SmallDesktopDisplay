#include "app/FrameDiagnostics.h"

namespace app
{

bool shouldLogFrameDiagnostics(bool fullFrame, uint32_t payloadLength, uint16_t rectCount)
{
  return fullFrame || payloadLength > 12000U || rectCount > 4U;
}

uint32_t frameOtherMs(const FrameDiagnostics &diagnostics)
{
  const uint32_t accounted =
      diagnostics.beginMs + diagnostics.getMs + diagnostics.headerMs + diagnostics.readMs + diagnostics.tftMs;
  return diagnostics.totalMs > accounted ? diagnostics.totalMs - accounted : 0U;
}

} // namespace app
