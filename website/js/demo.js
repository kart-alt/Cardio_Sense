/* js/demo.js — Offline Presentation Demo Simulator */

class CardioDemoMode {
  constructor(onMessageCallback) {
    this.onMessage = onMessageCallback;
    this.streamInterval = null;
    this.testInterval = null;
    this.isActive = false;
    
    // Physiological cycle states
    this.ecgIndex = 0;
    this.hrBaseline = 76;
    this.spo2Baseline = 97.4;
    this.tempBaseline = 36.8;
    this.activityLevel = 'resting';
    
    // Active test simulation state
    this.testElapsed = 0;
    this.testTotal = 60;
  }
  
  // Activate sensor streaming
  start() {
    if (this.isActive) return;
    this.isActive = true;
    console.log('[DemoMode] Activated. Generating biometrics stream...');
    
    // Reset state baselines
    this.hrBaseline = 72 + Math.floor(Math.random() * 8);
    this.spo2Baseline = 96.8 + Math.random() * 1.5;
    this.tempBaseline = 36.6 + Math.random() * 0.4;
    this.activityLevel = 'resting';
    
    // Stream data packets every 200ms
    this.streamInterval = setInterval(() => {
      this.generateSensorPacket();
    }, 200);
  }
  
  // Halt sensor streaming
  stop() {
    this.isActive = false;
    if (this.streamInterval) {
      clearInterval(this.streamInterval);
      this.streamInterval = null;
    }
    this.stopTestSimulation();
    console.log('[DemoMode] Deactivated.');
  }
  
  // Math model for highly realistic ECG heartbeat cycle
  getECGValue(index) {
    const cycleLen = 30; // Number of 200ms intervals inside a single beat cycle (~6 seconds cycle or adjusted)
    // Wait, let's make it beat-frequency aligned. If HR is 75 BPM, a beat is every 800ms.
    // 800ms / 200ms = 4 packets. That's too short for a beautiful waveform!
    // To make it look like a smooth scrolling analog monitor, we generate data points as if sampled at 125Hz,
    // but update the chart continuously.
    // Let's generate a continuous wave index:
    const phase = index % 50; // 50 data points per cardiac cycle
    let val = 2048; // Baseline voltage ADC representation (12-bit ADC centered at 2048)
    
    if (phase >= 5 && phase < 8) {
      // P-wave (small rounded hump)
      const pIndex = (phase - 5) / 3;
      val += Math.sin(pIndex * Math.PI) * 120;
    } else if (phase === 9) {
      // Q-wave (downward dip)
      val -= 180;
    } else if (phase === 10) {
      // R-wave (massive upward sharp peak)
      val += 900;
    } else if (phase === 11) {
      // S-wave (deep downward sharp peak)
      val -= 350;
    } else if (phase >= 15 && phase < 22) {
      // T-wave (broad rounded hump)
      const tIndex = (phase - 15) / 7;
      val += Math.sin(tIndex * Math.PI) * 260;
    } else if (phase >= 23 && phase < 25) {
      // U-wave (tiny late hump)
      const uIndex = (phase - 23) / 2;
      val += Math.sin(uIndex * Math.PI) * 30;
    }
    
    // Add slow breathing baseline drift (sinus arrhythmia simulation)
    val += Math.sin(index * 0.05) * 60;
    
    // Add high frequency analog thermal noise
    val += (Math.random() - 0.5) * 20;
    
    return Math.round(val);
  }
  
  // Assemble biometric stream packet
  generateSensorPacket() {
    this.ecgIndex++;
    
    // Slow fluctuating drift on biometrics
    const hrDelta = Math.sin(this.ecgIndex * 0.02) * 2 + (Math.random() - 0.5) * 1;
    const currentHR = Math.round(this.hrBaseline + hrDelta);
    
    const spo2Delta = Math.sin(this.ecgIndex * 0.01) * 0.1 + (Math.random() - 0.5) * 0.05;
    const currentSpO2 = parseFloat((this.spo2Baseline + spo2Delta).toFixed(1));
    
    const tempDelta = Math.sin(this.ecgIndex * 0.005) * 0.05 + (Math.random() - 0.5) * 0.01;
    const currentTempC = parseFloat((this.tempBaseline + tempDelta).toFixed(1));
    const currentTempF = parseFloat((currentTempC * 1.8 + 32).toFixed(1));
    
    // Random tiny activity motion jitter
    let accelX = (Math.random() - 0.5) * 0.04;
    let accelY = 0.98 + (Math.random() - 0.5) * 0.03; // ~1G gravity vector alignment
    let accelZ = (Math.random() - 0.5) * 0.04;
    let magnitude = parseFloat(Math.sqrt(accelX*accelX + (accelY-0.98)*(accelY-0.98) + accelZ*accelZ).toFixed(2));
    
    let activity = 'resting';
    if (magnitude > 0.15) activity = 'low motion';
    
    // Normalized pressure contact FSR representation
    let pressure = 512 + Math.floor((Math.random() - 0.5) * 20);
    let pressureNormalized = parseFloat((pressure / 1024 + 0.4).toFixed(2));
    
    const packet = {
      type: 'sensor_stream',
      timestamp: Date.now(),
      ecg: {
        raw_value: this.getECGValue(this.ecgIndex),
        heart_rate: currentHR,
        rr_interval_ms: Math.round(60000 / currentHR + (Math.random() - 0.5) * 30),
        signal_quality: 0.92 + (Math.random() - 0.5) * 0.02
      },
      ppg: {
        heart_rate: currentHR - 1,
        spo2: currentSpO2,
        red_value: 51200 + Math.floor(Math.sin(this.ecgIndex * 0.4) * 800),
        ir_value: 89600 + Math.floor(Math.sin(this.ecgIndex * 0.4) * 1400),
        signal_quality: 0.89 + (Math.random() - 0.5) * 0.03
      },
      temperature: {
        celsius: currentTempC,
        fahrenheit: currentTempF
      },
      motion: {
        accel_x: parseFloat(accelX.toFixed(3)),
        accel_y: parseFloat(accelY.toFixed(3)),
        accel_z: parseFloat(accelZ.toFixed(3)),
        magnitude: magnitude,
        activity_level: activity
      },
      pressure: {
        raw_value: pressure,
        normalized: pressureNormalized,
        contact_quality: pressureNormalized > 0.8 ? 'good' : 'fair'
      },
      device: {
        wifi_rssi: -60 - Math.floor(Math.random() * 8),
        battery_percent: 86 - Math.floor(this.ecgIndex * 0.0001),
        connected: true
      }
    };
    
    this.onMessage(packet);
  }
  
  // Trigger 60-second assessment simulation lifecycle
  startTestSimulation() {
    this.stopTestSimulation();
    this.testElapsed = 0;
    console.log('[DemoMode] Starting 60s cardiovascular assessment simulation...');
    
    // Pre-determine if this simulated test is high-risk or low-risk to generate coherent results
    this.simulatedOutcomeIsHighRisk = Math.random() > 0.4; // 60% chance of high risk for exciting hackathon presentations!
    
    this.testInterval = setInterval(() => {
      this.testElapsed++;
      
      let statusMsg = 'Analyzing heart rhythm...';
      if (this.testElapsed < 10) {
        statusMsg = 'Stabilizing raw ECG sensor leads...';
      } else if (this.testElapsed < 20) {
        statusMsg = 'Calibrating skin thermal baseline...';
      } else if (this.testElapsed < 35) {
        statusMsg = 'Aggregating ECG cardiac cycles & HRV matrices...';
      } else if (this.testElapsed < 48) {
        statusMsg = 'Evaluating PPG oxygenation index (SpO₂)...';
      } else if (this.testElapsed < 56) {
        statusMsg = 'Formatting data structure for neural classifier...';
      } else if (this.testElapsed <= 59) {
        statusMsg = 'Retrieving ML prediction from Flask API...';
      }
      
      const progressPacket = {
        type: 'test_progress',
        elapsed_seconds: this.testElapsed,
        total_seconds: this.testTotal,
        status: this.testElapsed === this.testTotal ? 'completed' : 'collecting',
        message: statusMsg
      };
      
      this.onMessage(progressPacket);
      
      if (this.testElapsed >= this.testTotal) {
        this.stopTestSimulation();
        // Delay slightly before showing result to simulate network API round-trip
        setTimeout(() => {
          this.generatePredictionResult();
        }, 800);
      }
    }, 1000);
  }
  
  stopTestSimulation() {
    if (this.testInterval) {
      clearInterval(this.testInterval);
      this.testInterval = null;
    }
  }
  
  // Synthesize prediction result upon test conclusion
  generatePredictionResult() {
    console.log('[DemoMode] Synthesizing clinical prediction report...');
    
    let score, level, rhythmStatus, confidence, summary, recText, shap, snap;
    
    if (this.simulatedOutcomeIsHighRisk) {
      score = parseFloat((68 + Math.random() * 21).toFixed(1)); // 68 - 89 High
      level = 'High';
      rhythmStatus = Math.random() > 0.3 ? 'Abnormal Rhythm Detected' : 'Tachycardia Detected';
      confidence = parseFloat((0.87 + Math.random() * 0.1).toFixed(2));
      summary = 'Elevated cardiovascular risk detected.';
      recText = 'Comprehensive clinical assessment is strongly advised. The patient demonstrates signs of resting tachycardia combined with depressed oxygenation values and highly reduced Heart Rate Variability (HRV indices). Routine cardiological evaluation, including 12-lead diagnostic ECG and echocardiography, should be scheduled.';
      
      shap = [
        { feature: 'spo2_percent', contribution: 11.2 + Math.random() * 4, direction: 'increases_risk' },
        { feature: 'rmssd_ms', contribution: -7.8 - Math.random() * 3, direction: 'decreases_risk' },
        { feature: 'heart_rate_bpm', contribution: 6.4 + Math.random() * 2, direction: 'increases_risk' },
        { feature: 'sdnn_ms', contribution: -4.2 - Math.random() * 2, direction: 'decreases_risk' }
      ];
      
      snap = {
        heart_rate_bpm: 92 + Math.floor(Math.random() * 12),
        spo2_percent: parseFloat((92.4 + Math.random() * 2.2).toFixed(1)),
        body_temp_celsius: parseFloat((37.2 + Math.random() * 0.3).toFixed(1)),
        sdnn_ms: parseFloat((16.4 + Math.random() * 6).toFixed(1)),
        rmssd_ms: parseFloat((12.2 + Math.random() * 4).toFixed(1))
      };
    } else {
      score = parseFloat((12 + Math.random() * 16).toFixed(1)); // 12 - 28 Low
      level = 'Low';
      rhythmStatus = 'Normal Sinus Rhythm';
      confidence = parseFloat((0.91 + Math.random() * 0.08).toFixed(2));
      summary = 'Cardiovascular risk scores within healthy bounds.';
      recText = 'Cardiovascular metrics correspond to low risk profiles. Continue normal physical activities, balanced diet, and periodic physiological screenings to maintain baseline cardiac performance.';
      
      shap = [
        { feature: 'spo2_percent', contribution: -9.4 - Math.random() * 3, direction: 'decreases_risk' },
        { feature: 'rmssd_ms', contribution: -12.1 - Math.random() * 4, direction: 'decreases_risk' },
        { feature: 'heart_rate_bpm', contribution: 2.1 + Math.random() * 2, direction: 'increases_risk' },
        { feature: 'sdnn_ms', contribution: -8.4 - Math.random() * 3, direction: 'decreases_risk' }
      ];
      
      snap = {
        heart_rate_bpm: 68 + Math.floor(Math.random() * 8),
        spo2_percent: parseFloat((98.2 + Math.random() * 1.3).toFixed(1)),
        body_temp_celsius: parseFloat((36.6 + Math.random() * 0.3).toFixed(1)),
        sdnn_ms: parseFloat((45.2 + Math.random() * 8).toFixed(1)),
        rmssd_ms: parseFloat((34.8 + Math.random() * 6).toFixed(1))
      };
    }
    
    const resultPacket = {
      type: 'prediction_result',
      cardio_risk_score: score,
      risk_level: level,
      probability_of_cvd: Math.round(score),
      heart_status: rhythmStatus,
      confidence_score: confidence,
      recommendation: {
        summary: summary,
        recommendation: recText
      },
      shap_factors: shap,
      feature_snapshot: snap,
      timestamp: new Date().toISOString(),
      test_id: utils.generateTestId()
    };
    
    this.onMessage(resultPacket);
  }
}
