// ESP32-2432S028R ("Cheap Yellow Display"): 2.8" 240x320 TFT on HSPI, XPT2046 touch on its own
// pins, backlight on GPIO 21. LovyanGFX drives both; LVGL 9 draws through it.
#define LGFX_USE_V1
#include <LovyanGFX.hpp>
#include <Preferences.h>
#include <lvgl.h>

#include "app.h"

class LGFX : public lgfx::LGFX_Device {
#if CYD_PANEL == 3
  lgfx::Panel_ST7789 _panel;
#else
  lgfx::Panel_ILI9341 _panel;
#endif
  lgfx::Bus_SPI _bus;
  lgfx::Light_PWM _light;
  lgfx::Touch_XPT2046 _touch;

 public:
  LGFX() {
    {
      auto cfg = _bus.config();
      cfg.spi_host = HSPI_HOST;
      cfg.spi_mode = 0;
      cfg.freq_write = 40000000;
      cfg.freq_read = 16000000;
      cfg.spi_3wire = false;
      cfg.use_lock = true;
      cfg.dma_channel = SPI_DMA_CH_AUTO;
      cfg.pin_sclk = 14;
      cfg.pin_mosi = 13;
      cfg.pin_miso = 12;
      cfg.pin_dc = 2;
      _bus.config(cfg);
      _panel.setBus(&_bus);
    }
    {
      auto cfg = _panel.config();
      cfg.pin_cs = 15;
      cfg.pin_rst = -1;
      cfg.pin_busy = -1;
      cfg.panel_width = 240;
      cfg.panel_height = 320;
      cfg.offset_x = 0;
      cfg.offset_y = 0;
      cfg.offset_rotation = 0;
      cfg.readable = true;
      cfg.invert = (CYD_PANEL == 2 || CYD_PANEL == 3);
      cfg.rgb_order = false;
      cfg.dlen_16bit = false;
      cfg.bus_shared = false;
      _panel.config(cfg);
    }
    {
      auto cfg = _light.config();
      cfg.pin_bl = 21;
      cfg.invert = false;
      cfg.freq = 44100;
      cfg.pwm_channel = 7;
      _light.config(cfg);
      _panel.setLight(&_light);
    }
    {
      auto cfg = _touch.config();
      cfg.x_min = 300;
      cfg.x_max = 3900;
      cfg.y_min = 200;
      cfg.y_max = 3700;
      cfg.pin_int = 36;
      cfg.bus_shared = false;
      cfg.offset_rotation = 0;
      cfg.spi_host = VSPI_HOST;
      cfg.freq = 1000000;
      cfg.pin_sclk = 25;
      cfg.pin_mosi = 32;
      cfg.pin_miso = 39;
      cfg.pin_cs = 33;
      _touch.config(cfg);
      _panel.setTouch(&_touch);
    }
    setPanel(&_panel);
  }
};

static LGFX lcd;

static constexpr int SCREEN_W = 240;
static constexpr int SCREEN_H = 320;
static constexpr int BUF_LINES = 32;
static uint8_t drawBuf1[SCREEN_W * BUF_LINES * 2];
static uint8_t drawBuf2[SCREEN_W * BUF_LINES * 2];

static void flushCb(lv_display_t *disp, const lv_area_t *area, uint8_t *px) {
  const int32_t w = lv_area_get_width(area);
  const int32_t h = lv_area_get_height(area);
  lcd.startWrite();
  lcd.setAddrWindow(area->x1, area->y1, w, h);
  // LVGL renders little-endian RGB565; the panel wants it byte-swapped
  lcd.writePixels(reinterpret_cast<uint16_t *>(px), w * h, true);
  lcd.endWrite();
  lv_display_flush_ready(disp);
}

static void touchCb(lv_indev_t *, lv_indev_data_t *data) {
  uint16_t x, y;
  if (lcd.getTouch(&x, &y)) {
    data->state = LV_INDEV_STATE_PRESSED;
    data->point.x = x;
    data->point.y = y;
  } else {
    data->state = LV_INDEV_STATE_RELEASED;
  }
}

// Touch calibration differs from board to board (some panels are even mirrored), so it is
// measured once on the first start and kept in flash.
static bool loadCalibration() {
  Preferences prefs;
  prefs.begin("touch", true);
  uint16_t cal[8];
  const bool ok = prefs.getBytes("cal", cal, sizeof(cal)) == sizeof(cal);
  prefs.end();
  if (ok) lcd.setTouchCalibrate(cal);
  return ok;
}

void displayCalibrate() {
  uint16_t cal[8];
  lcd.fillScreen(TFT_BLACK);
  lcd.setTextColor(TFT_WHITE);
  lcd.setTextDatum(textdatum_t::middle_center);
  lcd.setTextSize(1);
  lcd.drawString("Touch calibration", SCREEN_W / 2, SCREEN_H / 2 - 20);
  lcd.drawString("Tap each arrow corner", SCREEN_W / 2, SCREEN_H / 2);
  lcd.calibrateTouch(cal, TFT_ORANGE, TFT_BLACK, 20);
  Preferences prefs;
  prefs.begin("touch", false);
  prefs.putBytes("cal", cal, sizeof(cal));
  prefs.end();
  lcd.fillScreen(TFT_BLACK);
  if (lv_display_get_default()) lv_obj_invalidate(lv_screen_active());
}

void displaySetBacklight(uint8_t level) { lcd.setBrightness(level); }

void displayBegin() {
  lcd.init();
  lcd.setRotation(SCREEN_ROTATION);
  lcd.setBrightness(200);
  lcd.fillScreen(TFT_BLACK);

  // Holding the screen while powering on forces a new calibration
  uint16_t x, y;
  bool held = false;
  if (lcd.getTouchRaw(&x, &y)) {
    delay(1500);
    held = lcd.getTouchRaw(&x, &y);
  }
  if (held || !loadCalibration()) displayCalibrate();

  lv_init();
  lv_tick_set_cb([]() -> uint32_t { return millis(); });

  lv_display_t *disp = lv_display_create(SCREEN_W, SCREEN_H);
  lv_display_set_flush_cb(disp, flushCb);
  lv_display_set_buffers(disp, drawBuf1, drawBuf2, sizeof(drawBuf1), LV_DISPLAY_RENDER_MODE_PARTIAL);

  lv_indev_t *indev = lv_indev_create();
  lv_indev_set_type(indev, LV_INDEV_TYPE_POINTER);
  lv_indev_set_read_cb(indev, touchCb);
}
