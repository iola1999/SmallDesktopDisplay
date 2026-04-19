#ifndef TFT_ESPI_SDD_ST7789_H
#define TFT_ESPI_SDD_ST7789_H

// 固定本项目的小方屏配置，避免依赖 .pio/libdeps 里的临时库内文件。
#define USER_SETUP_INFO "SDD_ST7789_240"

// 屏幕驱动与面板参数（来自仓库原先可工作的 TFT_eSPI 配置）
#define ST7789_2_DRIVER
#define TFT_RGB_ORDER 1
#define TFT_WIDTH 240
#define TFT_HEIGHT 240

// ESP-12E / NodeMCU 与屏幕连线
#define TFT_MISO 12
#define TFT_MOSI 13
#define TFT_SCLK 14
#define TFT_CS 15
#define TFT_DC 0
#define TFT_RST 2
#define TFT_BL 5

// 保持与原配置一致的字体与平滑字体支持
#define LOAD_GLCD
#define LOAD_FONT2
#define LOAD_FONT4
#define LOAD_FONT6
#define LOAD_FONT7
#define LOAD_FONT8
#define LOAD_GFXFF
#define SMOOTH_FONT

// 原项目已验证过的 SPI 频率
#define SPI_FREQUENCY 27000000
#define SPI_READ_FREQUENCY 20000000
#define SPI_TOUCH_FREQUENCY 2500000

#endif // TFT_ESPI_SDD_ST7789_H
