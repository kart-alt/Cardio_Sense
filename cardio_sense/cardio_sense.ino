#include <SPI.h>
#include <Wire.h>

/* -------- MAX30001 -------- */
#define CS_PIN 10
#define CNFG_GEN  0x10
#define CNFG_ECG  0x15
#define ECG_FIFO  0x21

/* -------- MAX30205 -------- */
#define TEMP_ADDR 0x49

/* -------- FSR -------- */
#define FSR_PIN A0

unsigned long startTime;
int countSamples = 0;

long ecgTotal = 0;
float tempTotal = 0;
int fsrTotal = 0;

/* ---------- MAX30001 FUNCTIONS ---------- */
void writeReg(uint8_t reg, uint32_t val) {
  digitalWrite(CS_PIN, LOW);
  SPI.transfer((reg << 1) & 0xFE);
  SPI.transfer((val >> 16) & 0xFF);
  SPI.transfer((val >> 8) & 0xFF);
  SPI.transfer(val & 0xFF);
  digitalWrite(CS_PIN, HIGH);
}

uint32_t readReg(uint8_t reg) {
  uint32_t val = 0;
  digitalWrite(CS_PIN, LOW);
  SPI.transfer((reg << 1) | 0x01);
  val |= (uint32_t)SPI.transfer(0x00) << 16;
  val |= (uint32_t)SPI.transfer(0x00) << 8;
  val |= SPI.transfer(0x00);
  digitalWrite(CS_PIN, HIGH);
  return val;
}

/* ---------- TEMP FUNCTION ---------- */
float readTemperature() {
  Wire.beginTransmission(TEMP_ADDR);
  Wire.write(0x00);
  Wire.endTransmission();

  Wire.requestFrom(TEMP_ADDR, 2);
  if (Wire.available() < 2) return 0;

  int16_t raw = (Wire.read() << 8) | Wire.read();
  raw >>= 4;
  return raw * 0.0625;
}

/* ---------- SETUP ---------- */
void setup() {
  Serial.begin(9600);
  delay(2000);

  Wire.begin();

  pinMode(CS_PIN, OUTPUT);
  digitalWrite(CS_PIN, HIGH);

  SPI.begin();
  SPI.beginTransaction(SPISettings(500000, MSBFIRST, SPI_MODE0));

  writeReg(CNFG_GEN, 0x081007);
  writeReg(CNFG_ECG, 0x805000);

  Serial.println("1 MINUTE TEST STARTED...");
  startTime = millis();
}

/* ---------- LOOP ---------- */
void loop() {

  if (millis() - startTime < 60000) {

    // ECG
    uint32_t raw = readReg(ECG_FIFO);
    int32_t ecg = raw & 0x3FFFF;
    if (ecg & 0x20000) ecg |= 0xFFFC0000;

    // Temperature
    float temp = readTemperature();

    // FSR
    int fsr = analogRead(FSR_PIN);

    ecgTotal += ecg;
    tempTotal += temp;
    fsrTotal += fsr;

    countSamples++;

    delay(100);  // stable sampling
  }
  else {

    float avgECG = ecgTotal / countSamples;
    float avgTemp = tempTotal / countSamples;
    int avgFSR = fsrTotal / countSamples;

    int opticalHR = 78;   // dummy
    int spo2 = 97;        // dummy

    Serial.println("\n===== FINAL REPORT =====");
    Serial.print("Avg ECG: "); Serial.println(avgECG);
    Serial.print("Avg Temp: "); Serial.println(avgTemp);
    Serial.print("Avg Pressure: "); Serial.println(avgFSR);
    Serial.print("Optical HR (dummy): "); Serial.println(opticalHR);
    Serial.print("SpO2 (dummy): "); Serial.println(spo2);
    Serial.println("========================");

    while (1);  // stop program
  }
}
void setup() {
  // put your setup code here, to run once:

}

void loop() {
  // put your main code here, to run repeatedly:

}
