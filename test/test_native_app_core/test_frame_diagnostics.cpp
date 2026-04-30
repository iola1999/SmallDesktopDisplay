#include <doctest.h>

#include "app/FrameDiagnostics.h"

TEST_CASE("frame diagnostics logs full and large frames")
{
  CHECK(app::shouldLogFrameDiagnostics(true, 100, 1));
  CHECK(app::shouldLogFrameDiagnostics(false, 12001, 1));
  CHECK(app::shouldLogFrameDiagnostics(false, 1000, 5));
  CHECK_FALSE(app::shouldLogFrameDiagnostics(false, 12000, 4));
}

TEST_CASE("frame diagnostics calculates unaccounted time without underflow")
{
  app::FrameDiagnostics diagnostics;
  diagnostics.beginMs = 1;
  diagnostics.getMs = 9;
  diagnostics.headerMs = 2;
  diagnostics.readMs = 30;
  diagnostics.tftMs = 40;
  diagnostics.totalMs = 90;

  CHECK(app::frameOtherMs(diagnostics) == 8);

  diagnostics.totalMs = 70;
  CHECK(app::frameOtherMs(diagnostics) == 0);
}

TEST_CASE("frame diagnostics estimates client overhead from server timing")
{
  app::FrameDiagnostics diagnostics;
  diagnostics.getMs = 42;
  diagnostics.serverTotalMs = 11;

  CHECK(app::frameClientOverheadMs(diagnostics) == 31);

  diagnostics.serverTotalMs = 0;
  diagnostics.serverWaitMs = 7;
  diagnostics.serverRenderMs = 3;
  CHECK(app::frameClientOverheadMs(diagnostics) == 32);

  diagnostics.getMs = 5;
  CHECK(app::frameClientOverheadMs(diagnostics) == 0);
}
