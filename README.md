# Cardiovascular Risk Monitoring Dashboard

A clinical, medical-grade web interface for the **AI-Powered Cardiovascular Disease Early Risk Detection System** (AIoT Hackathon Project). 

This interface communicates in real-time with an ESP32 edge node to aggregate 60 seconds of clinical biometric inputs (ECG, SpO₂, Skin Temperature, contact pressure, and physical acceleration), interfaces with a Python Flask machine learning pipeline, and presents deep diagnostic and factor contribution analysis.

---

## 🚀 Key Features

* **Real-time Scrolling ECG Waveform**: A high-performance line graph showing real-time sliding window telemetry from the MAX30001 front end.
* **Double Trend Charts**: Tracks running averages and thresholds for heart rate (shaded 60-100 BPM normal zone) and blood oxygen saturation.
* **Pre-Check Assessment Sequence**: Displays structural status logs of all physical sensors prior to initiating risk calculations.
* **SVG needle Risk Gauge**: Dynamic arc visualization pointing directly to the generated risk index, accompanied by confidence metrics.
* **Horizontal SHAP Contribution Chart**: Illustrates the impact of each vital sign feature package on the final machine learning classification results.
* **Archived History Logs**: Full local caching of past tests in `localStorage`, longitudinal risk score trend lines, and retroactive review clicks.
* **Interactive Demo Mode**: Full client-side simulation engine that mimics real ESP32 biometric data, streams realistic rhythmic ECG beats, and sequencer-runs the 60s test and ML pipelines offline—perfect for presentations and judges' evaluations without active hardware!
* **Clinical Print Layout**: Clean PDF report generation optimized through custom media queries that filter out dashboards and action toggles.

---

## 🛠️ Technology Stack

* **Frontend Structure**: HTML5 Semantic markup, responsive flexbox/grid layout.
* **Styling**: Modern Vanilla CSS3, glowing cybernetic aesthetics, glassmorphic widgets, custom scrollbars, and pulsing alerts.
* **Typography**: Space Grotesk (clinical clean headings) & JetBrains Mono (monospaced telemetry readings) via Google Fonts.
* **Iconography**: Font Awesome 6 (medical & diagnostic indicators).
* **Charting**: Chart.js 4.4.1 (highly optimized line & scatter drawing).
* **Network Protocol**: HTML5 Native WebSockets API (connections directed to `ws://localhost:3000`).

---

## 📁 File Structure

```
website/
├── index.html           ← SPA Main Entry Frame
├── css/
│   ├── main.css         ← Global styles, navbar, status dots, and keyframe animations
│   ├── dashboard.css    ← 3-column layout grid & KPI cards
│   ├── test.css         ← Pre-checks grids & circular countdown rings
│   ├── results.css      ← Semicircular vector gauge, SHAP bars, and clinical tables
│   └── history.css      ← Longitudinal history plots & log tables
├── js/
│   ├── app.js           ← Router, telemetry handler, and page event listeners
│   ├── websocket.js     ← WS connection manager with automatic reconnect routines
│   ├── demo.js          ← Biometrics wave generator & offline test pipeline
│   ├── charts.js        ← Chart.js line and history trend plotting
│   └── utils.js         ← Local cache operations & medical threshold interpreters
└── README.md
```

---

## 💻 Running the Application

### Option A: Standard Offline Mode (Standalone Demo)
1. Double-click `index.html` inside the `website/` directory to load the interface in any modern browser.
2. In the top navigation bar, click the **Demo Mode** button (turns **ON**).
3. The interface will immediately initiate high-fidelity biological waveforms and telemetry.
4. Navigate to **Assessment Test**, review the sensor statuses, and click **START ASSESSMENT TEST** to witness a full 60-second test aggregation cycle, dynamic progress transitions, ML classification results, and history recording.

### Option B: Hardware Connected (Production Setup)
1. Ensure your Node.js WebSocket backend is running on `localhost:3000`.
2. Ensure your Python Flask ML API is running on `localhost:5000`.
3. Power on the ESP32 node and confirm it is connected to the same local area network.
4. Open the `website/index.html` page in your browser.
5. The connection badge in the top right will automatically turn green to display **CONNECTED**. 
6. Biosensing streams will flow across the dashboard in real-time.
