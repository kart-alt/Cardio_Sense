/* js/utils.js — Utility and Helper Routines (HTTP & Storage Connected) */

const utils = {
  // Determine API base domain depending on execution protocol (file:/// vs http://)
  getApiBase() {
    return window.location.protocol === 'file:' ? 'http://localhost:3000' : '';
  },

  // Session authentication helpers
  getActiveUser() {
    const data = sessionStorage.getItem('cardio_active_user');
    return data ? JSON.parse(data) : null;
  },

  setActiveUser(user) {
    sessionStorage.setItem('cardio_active_user', JSON.stringify(user));
  },

  clearActiveUser() {
    sessionStorage.removeItem('cardio_active_user');
  },

  // Save a new test result (asynchronous server save or client-side storage fallback)
  async saveTestResult(userId, result) {
    if (app.isDemoMode) {
      // Offline Demo Mode: Cache to isolated localStorage
      const history = this.getLocalHistoryRecords(userId);
      history.unshift(result);
      localStorage.setItem(`cardio_history_${userId}`, JSON.stringify(history));
      return history;
    }
    
    // Server-side SQLite save occurs automatically on the Node.js backend
    return [];
  },

  // Retrieve test history records for a patient (queries SQL database or local storage)
  async getHistoryRecords(userId) {
    if (app.isDemoMode) {
      // Offline Demo Mode: load isolated local database
      return this.getLocalHistoryRecords(userId);
    }

    try {
      const apiBase = this.getApiBase();
      console.log(`[HTTP API] Fetching test logs from backend SQL database for: ${userId}`);
      
      const res = await fetch(`${apiBase}/api/history?userId=${userId}`);
      if (!res.ok) throw new Error('API server error');
      const data = await res.json();
      return data;
    } catch (e) {
      console.warn('[HTTP API] Server unreachable. Loading historical local cache as backup:', e.message);
      return this.getLocalHistoryRecords(userId);
    }
  },

  // Local storage helper for isolated profiles
  getLocalHistoryRecords(userId) {
    const data = localStorage.getItem(`cardio_history_${userId}`);
    return data ? JSON.parse(data) : [];
  },

  // Generate a unique clinical test ID reference
  generateTestId() {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randDigits = Math.floor(1000 + Math.random() * 9000);
    return `TEST_${dateStr}_${randDigits}`;
  },

  // Convert raw timestamp to local time string (HH:MM:SS)
  formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  },

  // Format full clinical acquisition dates
  formatFullDate(dateVal) {
    if (!dateVal) return '--';
    const d = new Date(dateVal);
    return d.toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' + 
           d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  },

  // Determine clinical status bounds for Heart Rate
  getHeartRateStatus(bpm) {
    if (bpm < 50) return { label: 'Bradycardia', class: 'critical' };
    if (bpm <= 59) return { label: 'Low', class: 'warning' };
    if (bpm <= 100) return { label: 'Normal', class: 'normal' };
    if (bpm <= 120) return { label: 'Elevated', class: 'warning' };
    return { label: 'Tachycardia', class: 'critical' };
  },

  // Determine clinical status bounds for Oxygen Saturation SpO2
  getSpO2Status(spo2) {
    if (spo2 < 90) return { label: 'Hypoxia (Critical)', class: 'critical' };
    if (spo2 < 95) return { label: 'Mild Hypoxia', class: 'warning' };
    return { label: 'Optimal', class: 'normal' };
  },

  // Determine clinical status bounds for Body Temperature
  getTemperatureStatus(tempC) {
    if (tempC < 35.0) return { label: 'Hypothermia', class: 'critical' };
    if (tempC < 36.1) return { label: 'Cool', class: 'warning' };
    if (tempC <= 37.2) return { label: 'Normal', class: 'normal' };
    if (tempC <= 38.0) return { label: 'Low Fever', class: 'warning' };
    return { label: 'Hyperpyrexia', class: 'critical' };
  },

  // Determine clinical status bounds for Rhythm Regularity SDNN
  getSdnnStatus(sdnnMs) {
    if (sdnnMs < 30) return { label: 'Reduced (Low HRV)', class: 'warning' };
    if (sdnnMs <= 60) return { label: 'Healthy', class: 'normal' };
    return { label: 'Excellent', class: 'normal' };
  },

  // Determine clinical status bounds for Heart Rate Variability RMSSD
  getRmssdStatus(rmssdMs) {
    if (rmssdMs < 20) return { label: 'Reduced Variability', class: 'warning' };
    return { label: 'Healthy Range', class: 'normal' };
  },

  // Get color variable corresponding to risk score level
  getRiskColor(level) {
    const lvl = level ? level.toLowerCase() : '';
    if (lvl.includes('high')) return '#EF4444'; // red
    if (lvl.includes('mod') || lvl.includes('med')) return '#F59E0B'; // yellow
    return '#10B981'; // green
  },

  // Format SHAP feature names to user-friendly titles
  formatFeatureName(feature) {
    const mapping = {
      'spo2_percent': 'Blood Oxygen Level (SpO₂)',
      'rmssd_ms': 'Heart Rate Variability (RMSSD)',
      'heart_rate_bpm': 'Average Heart Rate',
      'sdnn_ms': 'Rhythm Variability (SDNN)',
      'body_temp_celsius': 'Thermal Regulation (Body Temp)',
      'motion_magnitude': 'Motion Artifact Magnitude'
    };
    return mapping[feature] || feature.replace(/_/g, ' ');
  }
};
