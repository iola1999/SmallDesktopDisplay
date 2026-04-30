#ifndef APP_FRAME_DIAGNOSTICS_H
#define APP_FRAME_DIAGNOSTICS_H

#include <cstdint>

namespace app
{

struct FrameDiagnostics
{
  uint32_t httpMs = 0;
  uint32_t headerMs = 0;
  uint32_t readMs = 0;
  uint32_t tftMs = 0;
  uint32_t totalMs = 0;
};

bool shouldLogFrameDiagnostics(bool fullFrame, uint32_t payloadLength, uint16_t rectCount);
uint32_t frameOtherMs(const FrameDiagnostics &diagnostics);

} // namespace app

#endif // APP_FRAME_DIAGNOSTICS_H
