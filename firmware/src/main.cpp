#include <Arduino.h>
#include <LittleFS.h>
#include <TFT_eSPI.h>
#include <TJpg_Decoder.h>
#include <WebServer.h>
#include <WiFi.h>

namespace Pins {
constexpr uint8_t button = 3;      // button to GND, INPUT_PULLUP
constexpr uint8_t backlight = 10;  // display BLK
}

constexpr char kMediaPath[] = "/media.kca";
constexpr uint32_t kHoldMs = 1800;
constexpr uint32_t kMaxFrameBytes = 120000;
constexpr uint32_t kWifiIdleTimeoutMs = 5UL * 60UL * 1000UL;

TFT_eSPI tft;
WebServer server(80);
File uploadFile;
bool pairingMode = false;
bool uploadSucceeded = false;
uint32_t pairingStartedAt = 0;
uint32_t pressedAt = 0;

struct __attribute__((packed)) KcaHeader {
  char magic[4];
  uint16_t width;
  uint16_t height;
  uint16_t frameCount;
  uint16_t delayMs;
  uint32_t reserved;
};

bool tftOutput(int16_t x, int16_t y, uint16_t w, uint16_t h, uint16_t *bitmap) {
  if (y >= tft.height()) return false;
  tft.pushImage(x, y, w, h, bitmap);
  return true;
}

void drawCentered(const String &title, const String &subtitle, uint16_t accent) {
  tft.fillScreen(TFT_BLACK);
  tft.fillRoundRect(24, 47, 192, 146, 18, TFT_DARKGREY);
  tft.drawRoundRect(24, 47, 192, 146, 18, accent);
  tft.setTextDatum(MC_DATUM);
  tft.setTextColor(accent, TFT_DARKGREY);
  tft.drawString(title, 120, 100, 2);
  tft.setTextColor(TFT_WHITE, TFT_DARKGREY);
  tft.drawString(subtitle, 120, 132, 2);
}

void drawUploadProgress(size_t current, size_t total) {
  const int width = total ? constrain((current * 174) / total, 0U, 174U) : 0;
  tft.fillRoundRect(33, 154, 174, 10, 5, TFT_BLACK);
  tft.fillRoundRect(33, 154, width, 10, 5, TFT_GREEN);
}

bool readHeader(File &file, KcaHeader &header) {
  if (!file || file.read(reinterpret_cast<uint8_t *>(&header), sizeof(header)) != sizeof(header)) return false;
  return memcmp(header.magic, "KCA1", 4) == 0 && header.width == 240 && header.height == 240 && header.frameCount > 0;
}

void playMediaOnce() {
  File file = LittleFS.open(kMediaPath, "r");
  KcaHeader header{};
  if (!readHeader(file, header)) {
    drawCentered("PIXELLOOP", "hold button to pair", TFT_ORANGE);
    return;
  }

  for (uint16_t frame = 0; frame < header.frameCount && !pairingMode; ++frame) {
    uint32_t size = 0;
    if (file.read(reinterpret_cast<uint8_t *>(&size), sizeof(size)) != sizeof(size) || size == 0 || size > kMaxFrameBytes) break;
    uint8_t *jpeg = static_cast<uint8_t *>(malloc(size));
    if (!jpeg || file.read(jpeg, size) != size) { free(jpeg); break; }
    const uint32_t started = millis();
    TJpgDec.drawJpg(0, 0, jpeg, size);
    free(jpeg);
    while (millis() - started < max<uint16_t>(header.delayMs, 40)) {
      if (digitalRead(Pins::button) == LOW) break;
      delay(1);
    }
  }
  file.close();
}

void addCors() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  server.sendHeader("Access-Control-Allow-Headers", "Content-Type");
  server.sendHeader("Access-Control-Allow-Private-Network", "true");
}

const char portal[] PROGMEM = R"HTML(
<!doctype html><meta name=viewport content="width=device-width"><title>PixelLoop</title>
<style>body{font:16px system-ui;background:#18201d;color:#f4f0e5;display:grid;place-items:center;min-height:90vh}main{max-width:420px;padding:32px;border:1px solid #66706c;border-radius:20px}h1{color:#c9ff62}input,button{width:100%;margin-top:14px}button{padding:14px;background:#c9ff62;border:0;border-radius:9px;font-weight:800}</style>
<main><h1>✦ PixelLoop</h1><p>Choose the <b>.kca</b> file exported by the PixelLoop Studio.</p>
<form method=POST action=/api/upload enctype=multipart/form-data><input required type=file name=media accept=.kca><button>Beam to keychain</button></form></main>
)HTML";

void configureServer() {
  server.on("/", HTTP_GET, [] { server.send_P(200, "text/html", portal); });
  server.on("/api/status", HTTP_OPTIONS, [] { addCors(); server.send(204); });
  server.on("/api/status", HTTP_GET, [] {
    addCors();
    server.send(200, "application/json", "{\"device\":\"PixelLoop\",\"display\":\"240x240\",\"ready\":true}");
  });
  server.on("/api/upload", HTTP_OPTIONS, [] { addCors(); server.send(204); });
  server.on("/api/upload", HTTP_POST, [] {
    addCors();
    if (uploadFile) uploadFile.close();
    if (uploadSucceeded) {
      server.send(200, "application/json", "{\"ok\":true}");
      drawCentered("UPLOAD COMPLETE", "your loop is ready", TFT_GREEN);
      delay(900);
    } else {
      LittleFS.remove(kMediaPath);
      server.send(500, "application/json", "{\"ok\":false}");
      drawCentered("UPLOAD FAILED", "please try again", TFT_RED);
    }
  }, [] {
    HTTPUpload &upload = server.upload();
    if (upload.status == UPLOAD_FILE_START) {
      uploadSucceeded = false;
      LittleFS.remove("/media.tmp");
      uploadFile = LittleFS.open("/media.tmp", "w");
      drawCentered("RECEIVING LOOP", "keep this page open", TFT_GREEN);
    } else if (upload.status == UPLOAD_FILE_WRITE && uploadFile) {
      if (uploadFile.write(upload.buf, upload.currentSize) != upload.currentSize) uploadSucceeded = false;
      // The multipart parser exposes bytes received, not the final file length.
      // Fill against a practical 1 MiB target; the completion screen confirms 100%.
      drawUploadProgress(upload.totalSize, 1024UL * 1024UL);
    } else if (upload.status == UPLOAD_FILE_END && uploadFile) {
      uploadFile.close();
      File check = LittleFS.open("/media.tmp", "r");
      KcaHeader header{};
      uploadSucceeded = readHeader(check, header);
      check.close();
      if (uploadSucceeded) {
        LittleFS.remove(kMediaPath);
        uploadSucceeded = LittleFS.rename("/media.tmp", kMediaPath);
      }
    } else if (upload.status == UPLOAD_FILE_ABORTED) {
      if (uploadFile) uploadFile.close();
      LittleFS.remove("/media.tmp");
      uploadSucceeded = false;
    }
  });
  server.onNotFound([] { addCors(); server.send(404, "application/json", "{\"error\":\"not found\"}"); });
}

void startPairing() {
  pairingMode = true;
  pairingStartedAt = millis();
  const uint32_t chip = static_cast<uint32_t>(ESP.getEfuseMac());
  char ssid[24];
  snprintf(ssid, sizeof(ssid), "PixelLoop-%04X", chip & 0xFFFF);
  WiFi.mode(WIFI_AP);
  WiFi.softAP(ssid); // intentionally open for a frictionless prototype; add WPA2 before shipping
  server.begin();
  drawCentered("PAIRING MODE", String(ssid), TFT_CYAN);
  Serial.printf("Join %s, then open http://%s\n", ssid, WiFi.softAPIP().toString().c_str());
}

void stopPairing() {
  server.stop();
  WiFi.softAPdisconnect(true);
  WiFi.mode(WIFI_OFF);
  pairingMode = false;
  uploadSucceeded = false;
}

void checkButton() {
  if (digitalRead(Pins::button) == LOW) {
    if (!pressedAt) pressedAt = millis();
    if (!pairingMode && millis() - pressedAt >= kHoldMs) startPairing();
  } else {
    pressedAt = 0;
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(Pins::button, INPUT_PULLUP);
  pinMode(Pins::backlight, OUTPUT);
  digitalWrite(Pins::backlight, HIGH);
  tft.init();
  tft.setRotation(0);
  tft.setSwapBytes(true);
  TJpgDec.setJpgScale(1);
  TJpgDec.setCallback(tftOutput);
  if (!LittleFS.begin(true)) drawCentered("STORAGE ERROR", "reflash filesystem", TFT_RED);
  else drawCentered("PIXELLOOP", "starting...", TFT_ORANGE);
  configureServer();
  WiFi.mode(WIFI_OFF);
}

void loop() {
  checkButton();
  if (pairingMode) {
    server.handleClient();
    if (millis() - pairingStartedAt > kWifiIdleTimeoutMs && WiFi.softAPgetStationNum() == 0) stopPairing();
    delay(2);
    return;
  }
  playMediaOnce();
}
