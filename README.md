# PixelLoop Keychain

PixelLoop is a rechargeable ESP32-C3 keychain with a 240 x 240 ST7789 display. The repository contains:

- a Next.js media studio for cropping, trimming, previewing, and packaging photos, GIFs, and short videos;
- PlatformIO firmware that plays the packaged animation from LittleFS;
- a Wi-Fi pairing and upload API hosted by the ESP32-C3;
- wiring and power notes for the physical prototype.

## Project layout

```text
app/                 Next.js application routes and global styles
components/          Studio, keychain preview, and pairing UI
lib/media.ts         Browser-side image/GIF/video encoder
firmware/            PlatformIO ESP32-C3 project
firmware/src/main.cpp
```

## Open the project on another PC

Install Git, Node.js 20 or newer, VS Code, and the PlatformIO VS Code extension. Then run:

```bash
git clone https://github.com/UmeshKunvariya/keychain.git
cd keychain
npm install
npm run dev
```

Open `http://localhost:3000` for the website.

To work on the ESP32 firmware, use **File > Open Folder** in VS Code and open the `firmware` directory. PlatformIO will install the ESP32 platform and the libraries declared in `firmware/platformio.ini`. Connect the ESP32-C3, then use **PlatformIO: Upload**.

## Website workflow

1. Choose a JPG, PNG, animated GIF, MP4, or WebM file.
2. Crop, zoom, reposition, and trim it in the 240 x 240 preview.
3. Hold the keychain button for about two seconds.
4. Join the `PixelLoop-xxxx` Wi-Fi network.
5. Find the device and upload, or download `pixelloop.kca` and open `http://192.168.4.1`.

The device address defaults to `http://192.168.4.1`. Override it during local development with `NEXT_PUBLIC_DEVICE_URL` if required.

## ESP32 and ST7789 connections

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
| Push button | GPIO3 to GND |

The push button uses the ESP32's internal pull-up. Use one pin from each opposite side of the four-leg tactile switch.

## Prototype battery connection without a boost converter

Use one protected 3.7 V Li-ion/Li-Po cell and a protected TP4056 module with `B+`, `B-`, `OUT+`, and `OUT-` terminals:

```text
Battery +       -> TP4056 B+
Battery -       -> TP4056 B-
TP4056 OUT+     -> slide switch -> ESP32 5V
TP4056 OUT-     -> ESP32 GND
ESP32 3V3       -> ST7789 VCC
ESP32 GND       -> ST7789 GND
```

Do not connect the battery to the ESP32 `3V3` pin. Charge with the slide switch off, and switch battery power off before connecting the ESP32 USB cable. Without a boost converter, the ESP32 may reset as battery voltage falls, particularly during Wi-Fi activity.

More firmware and wiring information is in [firmware/README.md](firmware/README.md).

## Vercel deployment note

The interface can be deployed to Vercel. Browsers may block an HTTPS Vercel page from sending media directly to the ESP32's plain-HTTP private address. The reliable deployed workflow is:

1. prepare and download `pixelloop.kca` from the Vercel app;
2. join the keychain Wi-Fi network;
3. open `http://192.168.4.1`;
4. upload the downloaded file through the built-in device portal.

## Media format and limits

The studio produces a `KCA1` container containing 240 x 240 JPEG frames. Animations are limited to 36 frames and videos to 12 seconds to stay within ESP32-C3 memory and flash constraints.

## Validation

```bash
npm run lint
npm run build
```

Build the firmware from the `firmware` directory with PlatformIO:

```bash
pio run
```
