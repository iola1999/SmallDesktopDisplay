#define DOCTEST_CONFIG_IMPLEMENT
#include <doctest.h>

int main(int argc, char **argv)
{
  doctest::Context context;
  context.setOption("success", true);
  context.setOption("no-exitcode", false);
  context.applyCommandLine(argc, argv);
  return context.run();
}
