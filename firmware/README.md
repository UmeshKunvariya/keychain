# PixelLoop firmware

Open this `firmware` folder as a PlatformIO project, connect the ESP32-C3 Super Mini by USB-C, then use **PlatformIO: Upload**. The first upload creates LittleFS automatically when the animation is uploaded from the web UI.

## Pin map

| ST7789 / control | ESP32-C3 Super Mini |
|---|---:|
| VCC | 3V3 |
| GND | GND |
| SCL / SCK | GPIO4 |
| SDA / MOSI | GPIO6 |
| CS | GPIO7 |
| DC | GPIO2 |
| RES / RST | GPIO1 |
| BLK / BL | GPIO10 |
| Push button leg A | GPIO3 |
| Push button opposite leg B | GND |

The 6×6 tactile switch has two internally connected pins on each side. Use one pin from each opposite side. No external resistor is needed because the firmware enables the ESP32 internal pull-up.

Hold the button for about 2 seconds to start the open `PixelLoop-xxxx` access point. Join it from your phone/laptop, then use the studio or browse to `http://192.168.4.1`. Pairing mode times out after five minutes with no connected station.

> Confirm the silk-screen labels on the display before powering it. Never connect its signal pins to 5 V.
