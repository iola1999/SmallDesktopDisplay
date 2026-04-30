#ifndef APP_FRAME_DIAGNOSTICS_H
#define APP_FRAME_DIAGNOSTICS_H

#include <cstdint>

namespace app
{

struct FrameDiagnostics
{
  uint32_t beginMs = 0;
  uint32_t getMs = 0;
  uint32_t serverWaitMs = 0;
  uint32_t serverRenderMs = 0;
  uint32_t serverTotalMs = 0;
  uint32_t headerMs = 0;
  uint32_t readMs = 0;
  uint32_t tftMs = 0;
  uint32_t totalMs = 0;
  uint32_t streamReads = 0;
  uint32_t streamBytes = 0;
  uint32_t tftCalls = 0;
};

bool shouldLogFrameDiagnostics(bool fullFrame, uint32_t payloadLength, uint16_t rectCount);
uint32_t frameOtherMs(const FrameDiagnostics &diagnostics);
uint32_t frameClientOverheadMs(const FrameDiagnostics &diagnostics);

} // namespace app

#endif // APP_FRAME_DIAGNOSTICS_H
