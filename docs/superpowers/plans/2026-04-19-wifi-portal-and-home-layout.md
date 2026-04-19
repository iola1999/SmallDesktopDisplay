# WiFi Portal And Home Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add nearby WiFi listing and city-code controls to the lightweight web portal, and rebalance the home screen layout after removing the animation.

**Architecture:** Keep the ESP8266-specific scanning and captive-portal loop inside `src/Net.cpp`, but extract HTML rendering and city-code normalization into a pure C++ helper under `src/app/` so host tests can lock behavior. Rework `src/Screen.cpp` layout only with existing weather/time/humidity data, avoiding new dependencies or assets.

**Tech Stack:** PlatformIO, ESP8266 Arduino core, doctest host tests, `ESP8266WebServer`, `DNSServer`, `TFT_eSPI`, `TJpg_Decoder`

---

### Task 1: Portal Rendering And City-Code Rules

**Files:**
- Create: `src/app/WifiPortalPage.h`
- Create: `src/app/WifiPortalPage.cpp`
- Modify: `test/test_native_app_core/test_wifi_portal_page.cpp`

- [ ] **Step 1: Write the failing test**

```cpp
#include <doctest.h>

#include "app/WifiPortalPage.h"

#include <vector>

TEST_CASE("wifi portal page renders nearby ssids and city code guidance")
{
  const std::vector<app::WifiPortalNetwork> networks{
    {"Office-5G", -42, true},
    {"Office-2G", -55, false},
  };

  const std::string html = app::buildWifiPortalPage(
    "SDD-Setup",
    "192.168.4.1",
    networks,
    "Office-5G",
    "101210102",
    "");

  CHECK(html.find("Office-5G") != std::string::npos);
  CHECK(html.find("Nearby WiFi") != std::string::npos);
  CHECK(html.find("City code") != std::string::npos);
  CHECK(html.find("0 or blank = auto detect") != std::string::npos);
}

TEST_CASE("wifi portal city code input keeps auto detect semantics")
{
  CHECK(app::normalizeCityCodeInput("") == "");
  CHECK(app::normalizeCityCodeInput("0") == "");
  CHECK(app::normalizeCityCodeInput("101210102") == "101210102");
  CHECK(app::normalizeCityCodeInput("abc").empty());
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `~/.platformio/penv/bin/pio test -e host --without-uploading -f test_native_app_core --filter test_wifi_portal_page`
Expected: FAIL because `WifiPortalPage` helpers do not exist yet.

- [ ] **Step 3: Write minimal implementation**

```cpp
struct WifiPortalNetwork
{
  std::string ssid;
  int32_t rssi = 0;
  bool encrypted = true;
};

std::string normalizeCityCodeInput(const std::string &input);
std::string buildWifiPortalPage(...);
```

Implement only:
- HTML generation for nearby SSID list, credential fields, and city-code hint.
- `normalizeCityCodeInput` returning `""` for blank or `0`, valid 9-digit codes unchanged, invalid input as `""`.

- [ ] **Step 4: Run test to verify it passes**

Run: `~/.platformio/penv/bin/pio test -e host --without-uploading -f test_native_app_core --filter test_wifi_portal_page`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/WifiPortalPage.h src/app/WifiPortalPage.cpp test/test_native_app_core/test_wifi_portal_page.cpp
git commit -m "test: cover wifi portal rendering rules"
```

### Task 2: ESP8266 Portal Wiring

**Files:**
- Modify: `src/Net.cpp`

- [ ] **Step 1: Write the failing test**

Use Task 1 tests as the red coverage for HTML and city-code behavior; no new host-only test is needed for the ESP8266 scan loop.

- [ ] **Step 2: Run test to verify it fails**

Run: `~/.platformio/penv/bin/pio test -e host --without-uploading -f test_native_app_core --filter test_wifi_portal_page`
Expected: PASS after Task 1, then use firmware build as the failing proof for integration issues.

- [ ] **Step 3: Write minimal implementation**

Implement in `src/Net.cpp`:
- nearby AP scan before/while serving portal
- sort list by RSSI descending
- feed scan results into `buildWifiPortalPage`
- accept `CityCode` on save
- persist normalized city-code value into `AppConfigData`

- [ ] **Step 4: Run verification**

Run: `~/.platformio/penv/bin/pio run -e esp12e`
Expected: PASS with firmware build success.

- [ ] **Step 5: Commit**

```bash
git add src/Net.cpp src/app/WifiPortalPage.h src/app/WifiPortalPage.cpp test/test_native_app_core/test_wifi_portal_page.cpp
git commit -m "feat: expand lightweight wifi setup portal"
```

### Task 3: Home Screen Rebalance

**Files:**
- Modify: `src/Screen.cpp`
- Modify: `docs/recent-iterations.md`

- [ ] **Step 1: Write the failing test**

No meaningful host-side rendering test exists for the TFT layout. Use explicit build verification and manual coordinate review.

- [ ] **Step 2: Run test to verify it fails**

Run: `~/.platformio/penv/bin/pio run -e esp12e`
Expected: Current build passes, but layout still leaves the lower-right area visually underused.

- [ ] **Step 3: Write minimal implementation**

Adjust `src/Screen.cpp` to:
- enlarge or visually promote the top-right weather icon
- move AQI/date into a tighter top band
- rebalance lower content into two stronger data columns/blocks
- keep the bottom banner readable

- [ ] **Step 4: Run verification**

Run: `~/.platformio/penv/bin/pio run -e esp12e`
Expected: PASS with firmware build success.

- [ ] **Step 5: Commit**

```bash
git add src/Screen.cpp docs/recent-iterations.md
git commit -m "feat: rebalance home screen after animation removal"
```
