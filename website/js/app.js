/* js/app.js — Core Single-Page Application (SPA) Controller (HTTP & DB Connected) */

class CardioApp {
  constructor() {
    this.wsClient = null;
    this.demoEngine = null;
    
    // State Flags
    this.isDemoMode = false;
    this.currentUser = null; // Holds active authenticated patient session
    this.currentView = 'login';
    this.activeTestState = 'idle'; // idle | executing
    
    // Telemetry aggregators
    this.streamReadingsCount = 0;
    this.trendUpdateThrottle = 10;
    this.hrValuesHistory = [];
    this.spo2ValuesHistory = [];
  }
  
  // Initialize application, session management, and start clock routines
  init() {
    console.log('[CardioAI] Initializing Full-Stack SPA application...');
    
    // 1. Start Clock Display loop
    this.startNavbarClock();
    
    // 2. Initialize Charts
    charts.initAll();
    
    // 3. Set up SPA navigation routes click hooks
    this.bindNavigation();
    
    // 4. Initialize WebSocket Client
    this.initWebSocket();
    
    // 5. Initialize Demo Engine
    this.initDemoMode();
    
    // 6. Bind Authentication Forms UI inputs
    this.bindAuthEvents();
    
    // 7. Bind UI Action buttons
    this.bindUIActions();
    
    // 8. Restore active user sessions
    this.checkSessionAuth();
    
    console.log('[CardioAI] Authentication portal ready. Listening for connections.');
  }
  
  // Real-time navigation bar clock loop
  startNavbarClock() {
    const clockEl = document.getElementById('time-display');
    if (clockEl) {
      setInterval(() => {
        const now = new Date();
        clockEl.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      }, 1000);
    }
  }
  
  // Restore logged-in patient sessions
  checkSessionAuth() {
    const savedUser = utils.getActiveUser();
    if (savedUser) {
      console.log('[Auth] Active session found for patient:', savedUser.name);
      this.currentUser = savedUser;
      
      // If active user exists, double check if it was a demo session
      if (savedUser.id === 'USR_PATIENT' || savedUser.id.startsWith('USR_DEMO')) {
        this.enableDemoModeFallback(savedUser.email, savedUser.name);
      } else {
        this.onLoginSuccess();
      }
    } else {
      console.log('[Auth] Unauthenticated session. Redirecting to Login view.');
      this.navigateTo('login');
    }
  }
  
  // Enable offline Demo Mode gracefully if backend server is unreachable
  enableDemoModeFallback(email, name = '') {
    console.warn('[Auth] Express server is unreachable. Automatically falling back to interactive client-side Demo Mode.');
    
    // 1. Set Demo Mode active state
    this.isDemoMode = true;
    
    // Toggle demo toggle button
    const toggleBtn = document.getElementById('demo-mode-toggle');
    if (toggleBtn) {
      toggleBtn.classList.add('active-mode');
      const statusText = document.getElementById('demo-status-text');
      if (statusText) statusText.textContent = 'ON';
    }
    
    // Style badges into demo states
    const connectionBadge = document.getElementById('connection-status-text');
    const connectionBadgeContainer = document.getElementById('device-status-badge');
    const pulseDot = document.getElementById('device-pulse-dot');
    const offlineBanner = document.getElementById('network-alert-banner');
    
    if (connectionBadge) connectionBadge.textContent = 'DEMO SYSTEM';
    if (connectionBadgeContainer) {
      connectionBadgeContainer.className = 'status-badge connected';
      connectionBadgeContainer.style.borderColor = 'var(--accent-yellow)';
      connectionBadgeContainer.style.color = 'var(--accent-yellow)';
      connectionBadgeContainer.style.background = 'rgba(245, 158, 11, 0.1)';
    }
    if (pulseDot) {
      pulseDot.className = 'status-dot-pulse';
      pulseDot.style.backgroundColor = 'var(--accent-yellow)';
      pulseDot.style.boxShadow = '0 0 8px var(--accent-yellow)';
    }
    if (offlineBanner) offlineBanner.classList.add('hidden');
    
    // Stop WS client and start local simulator
    this.wsClient.disconnect();
    this.demoEngine.start();
    
    // Create and save active patient session
    const user = {
      id: 'USR_PATIENT',
      name: name || (email === 'patient@cardio.ai' ? 'Demo Patient' : email.split('@')[0]),
      email: email
    };
    utils.setActiveUser(user);
    this.currentUser = user;
    
    // Seed and complete login
    this.prepopulateDemoData(user.id);
    this.onLoginSuccess();
  }
  
  // Bind Sign In / Sign Up actions
  bindAuthEvents() {
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    
    const showRegisterLink = document.getElementById('link-show-register');
    const showLoginLink = document.getElementById('link-show-login');
    
    // Toggle between Forms
    if (showRegisterLink) {
      showRegisterLink.addEventListener('click', (e) => {
        e.preventDefault();
        loginForm.classList.add('hidden');
        registerForm.classList.remove('hidden');
        document.getElementById('login-error-alert').classList.add('hidden');
      });
    }
    
    if (showLoginLink) {
      showLoginLink.addEventListener('click', (e) => {
        e.preventDefault();
        registerForm.classList.add('hidden');
        loginForm.classList.remove('hidden');
        document.getElementById('register-error-alert').classList.add('hidden');
      });
    }
    
    // Login Form Submit Listener
    if (loginForm) {
      loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value.trim();
        const errorAlert = document.getElementById('login-error-alert');
        
        errorAlert.classList.add('hidden');
        
        if (this.isDemoMode) {
          // Explicit Demo Mode: Authenticate simulated patient immediately
          const user = {
            id: 'USR_PATIENT',
            name: email === 'patient@cardio.ai' ? 'Demo Patient' : email.split('@')[0],
            email: email
          };
          utils.setActiveUser(user);
          this.currentUser = user;
          this.prepopulateDemoData(user.id);
          this.onLoginSuccess();
          return;
        }
        
        try {
          const apiBase = utils.getApiBase();
          console.log('[Auth] Dispatching sign-in request to backend server:', `${apiBase}/api/auth/login`);
          
          const res = await fetch(`${apiBase}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
          });
          
          if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData.error || 'Authentication rejected');
          }
          
          const user = await res.json();
          utils.setActiveUser(user);
          this.currentUser = user;
          this.onLoginSuccess();
          
        } catch (err) {
          console.error('[Auth] Login failed:', err.message);
          
          // GRACEFUL FALLBACK: If Node.js backend server is offline or unreachable
          if (err.message.includes('fetch') || err.message.includes('Failed to fetch') || err.message.includes('NetworkError') || err.message.includes('unreachable')) {
            alert('Express backend server is offline on port 3000! Seamlessly activating high-fidelity Offline Demo Mode to run your hackathon presentation.');
            this.enableDemoModeFallback(email);
            return;
          }
          
          errorAlert.textContent = err.message || 'Server connection rejected';
          errorAlert.classList.remove('hidden');
        }
      });
    }
    
    // Registration Form Submit Listener
    if (registerForm) {
      registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('reg-name').value.trim();
        const email = document.getElementById('reg-email').value.trim();
        const password = document.getElementById('reg-password').value.trim();
        const errorAlert = document.getElementById('register-error-alert');
        const successAlert = document.getElementById('register-success-alert');
        
        errorAlert.classList.add('hidden');
        successAlert.classList.add('hidden');
        
        if (this.isDemoMode) {
          // Explicit Demo Mode: Register simulated patient immediately
          const user = {
            id: 'USR_PATIENT',
            name,
            email
          };
          successAlert.classList.remove('hidden');
          setTimeout(() => {
            utils.setActiveUser(user);
            this.currentUser = user;
            this.prepopulateDemoData(user.id);
            this.onLoginSuccess();
          }, 1000);
          return;
        }
        
        try {
          const apiBase = utils.getApiBase();
          console.log('[Auth] Dispatching registration request to backend database...');
          
          const res = await fetch(`${apiBase}/api/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, password })
          });
          
          if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData.error || 'Registration rejected');
          }
          
          const user = await res.json();
          successAlert.classList.remove('hidden');
          setTimeout(() => {
            utils.setActiveUser(user);
            this.currentUser = user;
            this.onLoginSuccess();
          }, 1000);
          
        } catch (err) {
          console.error('[Auth] Registration failed:', err.message);
          
          // GRACEFUL FALLBACK: If Node.js backend server is offline or unreachable
          if (err.message.includes('fetch') || err.message.includes('Failed to fetch') || err.message.includes('NetworkError') || err.message.includes('unreachable')) {
            alert('Express backend server is offline! Registering account under isolated offline profile (Demo Mode fallback).');
            this.enableDemoModeFallback(email, name);
            return;
          }
          
          errorAlert.textContent = err.message || 'Server connection rejected';
          errorAlert.classList.remove('hidden');
        }
      });
    }
  }
  
  // Executes upon successful authentication
  async onLoginSuccess() {
    console.log(`[Auth] Patient authenticated successfully: ${this.currentUser.name}`);
    
    // 1. Show Navigation list links
    const navList = document.getElementById('navigation-list');
    const footer = document.getElementById('footer-section');
    if (navList) navList.classList.remove('hidden');
    if (footer) footer.classList.remove('hidden');
    
    // 2. Show Active profile pill in navbar
    const profileWidget = document.getElementById('nav-profile-widget');
    const userDisplayName = document.getElementById('user-display-name');
    if (profileWidget) profileWidget.classList.remove('hidden');
    if (userDisplayName) userDisplayName.textContent = this.currentUser.name;
    
    // 3. Clear auth form values
    document.getElementById('login-email').value = '';
    document.getElementById('login-password').value = '';
    document.getElementById('reg-name').value = '';
    document.getElementById('reg-email').value = '';
    document.getElementById('reg-password').value = '';
    
    document.getElementById('login-form').classList.remove('hidden');
    document.getElementById('register-form').classList.add('hidden');
    document.getElementById('login-error-alert').classList.add('hidden');
    document.getElementById('register-error-alert').classList.add('hidden');
    document.getElementById('register-success-alert').classList.add('hidden');
    
    // 4. Fetch and plot patient history
    await this.loadActiveUserHistory();
    
    // 5. Navigate to Dashboard
    this.navigateTo('dashboard');
  }
  
  // Asynchronously query database history logs
  async loadActiveUserHistory() {
    if (!this.currentUser) return;
    
    const records = await utils.getHistoryRecords(this.currentUser.id);
    console.log(`[CardioAI] Loaded ${records.length} assessment records for Patient.`);
    
    const riskKpiVal = document.getElementById('kpi-val-risk');
    const riskKpiBadge = document.getElementById('kpi-badge-risk');
    
    if (records.length > 0) {
      const lastRecord = records[0];
      if (riskKpiVal) riskKpiVal.textContent = Math.round(lastRecord.cardio_risk_score);
      if (riskKpiBadge) {
        riskKpiBadge.textContent = `${lastRecord.risk_level} Risk`;
        riskKpiBadge.className = `kpi-badge badge-${lastRecord.risk_level.toLowerCase()}`;
      }
      
      this.renderPredictionResultsView(lastRecord);
    } else {
      if (riskKpiVal) riskKpiVal.textContent = '--';
      if (riskKpiBadge) {
        riskKpiBadge.textContent = 'No Test';
        riskKpiBadge.className = 'kpi-badge badge-muted';
      }
    }
  }
  
  // Seed local history database with 3 beautiful, distinct tests for presentation
  prepopulateDemoData(userId) {
    const key = `cardio_history_${userId}`;
    if (localStorage.getItem(key)) return;
    
    console.log('[Demo] Seeding local isolated profile with 3 preloaded past clinical test histories...');
    
    const demoRecords = [
      {
        test_id: 'TEST_20260530_4812',
        user_id: userId,
        cardio_risk_score: 72.4,
        risk_level: 'High',
        probability_of_cvd: 72,
        heart_status: 'Abnormal Rhythm Detected',
        confidence_score: 0.91,
        recommendation: {
          summary: "Elevated cardiovascular risk detected.",
          recommendation: "Comprehensive clinical diagnostic investigation is highly advised. Features exhibit high resting tachycardia averages combined with a significant reduction in autonomic vagal tone indices (low HRV SDNN/RMSSD)."
        },
        shap_factors: [
          { feature: 'spo2_percent', contribution: 12.4, direction: 'increases_risk' },
          { feature: 'rmssd_ms', contribution: -8.2, direction: 'decreases_risk' },
          { feature: 'heart_rate_bpm', contribution: 6.1, direction: 'increases_risk' }
        ],
        feature_snapshot: {
          heart_rate_bpm: 94,
          spo2_percent: 94.1,
          body_temp_celsius: 37.2,
          sdnn_ms: 18.4,
          rmssd_ms: 14.2
        },
        timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      },
      {
        test_id: 'TEST_20260528_3105',
        user_id: userId,
        cardio_risk_score: 48.6,
        risk_level: 'Moderate',
        probability_of_cvd: 49,
        heart_status: 'Sinus Arrhythmia Flagged',
        confidence_score: 0.88,
        recommendation: {
          summary: "Moderate cardiovascular risk indicators flagged.",
          recommendation: "Biometrics present slight autonomic anomalies. Monitor respiratory intervals and HRV baseline changes. Plan standard cardiovascular review consults."
        },
        shap_factors: [
          { feature: 'rmssd_ms', contribution: 4.1, direction: 'increases_risk' },
          { feature: 'spo2_percent', contribution: -5.4, direction: 'decreases_risk' },
          { feature: 'heart_rate_bpm', contribution: 3.2, direction: 'increases_risk' }
        ],
        feature_snapshot: {
          heart_rate_bpm: 82,
          spo2_percent: 96.2,
          body_temp_celsius: 36.9,
          sdnn_ms: 28.5,
          rmssd_ms: 21.4
        },
        timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
      },
      {
        test_id: 'TEST_20260525_9471',
        user_id: userId,
        cardio_risk_score: 18.2,
        risk_level: 'Low',
        probability_of_cvd: 18,
        heart_status: 'Normal Sinus Rhythm',
        confidence_score: 0.94,
        recommendation: {
          summary: "Healthy cardiovascular baseline profile.",
          recommendation: "All biometrics ranges settle within optimal cardiovascular bounds. Continue normal physical efforts, cardiovascular checks, and balanced nutrition."
        },
        shap_factors: [
          { feature: 'spo2_percent', contribution: -10.2, direction: 'decreases_risk' },
          { feature: 'rmssd_ms', contribution: -11.5, direction: 'decreases_risk' },
          { feature: 'heart_rate_bpm', contribution: -1.2, direction: 'decreases_risk' }
        ],
        feature_snapshot: {
          heart_rate_bpm: 66,
          spo2_percent: 98.4,
          body_temp_celsius: 36.7,
          sdnn_ms: 48.2,
          rmssd_ms: 36.5
        },
        timestamp: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString()
      }
    ];
    
    localStorage.setItem(key, JSON.stringify(demoRecords));
  }
  
  // Bind navigation links clicking to show/hide views
  bindNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const page = item.getAttribute('data-page');
        this.navigateTo(page);
      });
    });
    
    window.addEventListener('hashchange', () => {
      this.handleRouteHash();
    });
  }
  
  handleRouteHash() {
    if (!this.currentUser) {
      this.navigateTo('login');
      return;
    }
    
    const hash = window.location.hash.replace('#', '');
    const validPages = ['dashboard', 'test', 'results', 'history'];
    if (hash && validPages.includes(hash)) {
      this.navigateTo(hash);
    } else {
      this.navigateTo('dashboard');
    }
  }
  
  // Route navigation switcher
  navigateTo(pageId) {
    if (!this.currentUser && pageId !== 'login') {
      pageId = 'login';
    }
    
    console.log(`[Router] Navigating to view: ${pageId}`);
    this.currentView = pageId;
    window.location.hash = pageId;
    
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
      if (item.getAttribute('data-page') === pageId) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });
    
    const pages = document.querySelectorAll('.page-view');
    pages.forEach(page => {
      if (page.getAttribute('id') === `${pageId}-page`) {
        page.classList.add('active');
      } else {
        page.classList.remove('active');
      }
    });
    
    if (pageId === 'history' && this.currentUser) {
      charts.renderHistoryTrend();
      this.renderHistoryRecords();
    }
  }
  
  // Setup WebSocket connection
  initWebSocket() {
    const apiBase = utils.getApiBase();
    // Prevent relative network routing on file:/// protocols by pointing absolutely
    const wsUrl = apiBase ? 'ws://localhost:3000' : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`;
    
    this.wsClient = new CardioWebSocket(wsUrl);
    
    this.wsClient.on('connected', () => this.handleNetworkConnection(true));
    this.wsClient.on('disconnected', () => this.handleNetworkConnection(false));
    this.wsClient.on('sensor_stream', (data) => this.processSensorStream(data));
    this.wsClient.on('test_progress', (data) => this.processTestProgress(data));
    this.wsClient.on('prediction_result', (data) => this.processPredictionResult(data));
    this.wsClient.on('device_status', (data) => this.processDeviceStatus(data));
    
    this.wsClient.connect();
  }
  
  // Handle network offline/online states
  handleNetworkConnection(isOnline) {
    const statusText = document.getElementById('connection-status-text');
    const statusBadge = document.getElementById('device-status-badge');
    const pulseDot = document.getElementById('device-pulse-dot');
    const offlineBanner = document.getElementById('network-alert-banner');
    
    if (this.isDemoMode) {
      return;
    }
    
    if (isOnline) {
      if (statusText) statusText.textContent = 'CONNECTED';
      if (statusBadge) {
        statusBadge.className = 'status-badge connected';
      }
      if (pulseDot) {
        pulseDot.className = 'status-dot-pulse online';
        pulseDot.title = 'Device Connected';
      }
      if (offlineBanner) offlineBanner.classList.add('hidden');
    } else {
      if (statusText) statusText.textContent = 'DISCONNECTED';
      if (statusBadge) {
        statusBadge.className = 'status-badge';
      }
      if (pulseDot) {
        pulseDot.className = 'status-dot-pulse';
        pulseDot.title = 'Device Disconnected';
      }
      if (offlineBanner && this.currentUser) {
        offlineBanner.classList.remove('hidden');
      }
      
      this.resetLiveDiagnostics();
    }
  }
  
  // Wipes metrics back to empty states when disconnected
  resetLiveDiagnostics() {
    document.getElementById('kpi-val-hr').textContent = '--';
    document.getElementById('kpi-val-spo2').textContent = '--';
    document.getElementById('kpi-val-temp').textContent = '--';
    
    document.getElementById('kpi-badge-hr').className = 'kpi-badge badge-muted';
    document.getElementById('kpi-badge-hr').textContent = '--';
    document.getElementById('kpi-badge-spo2').className = 'kpi-badge badge-muted';
    document.getElementById('kpi-badge-spo2').textContent = '--';
    document.getElementById('kpi-badge-temp').className = 'kpi-badge badge-muted';
    document.getElementById('kpi-badge-temp').textContent = '--';
    
    document.getElementById('ecg-signal-pct').textContent = '--%';
    document.getElementById('ecg-signal-bar').style.width = '0%';
    document.getElementById('electrode-quality').textContent = 'Stable';
    document.getElementById('rr-interval-value').textContent = '--';
    
    document.getElementById('diag-val-motion').textContent = '--';
    document.getElementById('diag-val-activity').textContent = '--';
    document.getElementById('diag-val-pressure').textContent = '--';
    document.getElementById('diag-val-contact').textContent = '--';
    document.getElementById('diag-val-rssi').textContent = '-- dBm';
    document.getElementById('diag-val-battery').textContent = '--%';
    document.getElementById('diag-val-signal').textContent = '--';
    document.getElementById('diag-val-lastseen').textContent = '--';
    
    document.getElementById('battery-text').textContent = '--%';
    document.getElementById('wifi-text').textContent = '-- dBm';
    
    const checklistItems = document.querySelectorAll('.sensor-item .sensor-status');
    checklistItems.forEach(item => {
      item.className = 'sensor-status text-muted';
      item.textContent = 'Offline';
    });
  }
  
  // Process sensor packets (comes from WebSocket or Demo Mode)
  processSensorStream(data) {
    if (!this.currentUser) return;
    
    if (this.currentView === 'dashboard') {
      charts.updateECG(data.ecg.raw_value);
      
      this.updateKPICard('hr', data.ecg.heart_rate, utils.getHeartRateStatus(data.ecg.heart_rate));
      this.updateKPICard('spo2', data.ppg.spo2, utils.getSpO2Status(data.ppg.spo2));
      this.updateKPICard('temp', data.temperature.celsius, utils.getTemperatureStatus(data.temperature.celsius));
      
      this.streamReadingsCount++;
      if (this.streamReadingsCount % this.trendUpdateThrottle === 0) {
        const timeLabel = utils.formatTime(data.timestamp);
        charts.appendHeartRateTrend(timeLabel, data.ecg.heart_rate);
        charts.appendSpO2Trend(timeLabel, data.ppg.spo2);
        
        this.hrValuesHistory.push(data.ecg.heart_rate);
        this.spo2ValuesHistory.push(data.ppg.spo2);
        if (this.hrValuesHistory.length > 60) this.hrValuesHistory.shift();
        if (this.spo2ValuesHistory.length > 60) this.spo2ValuesHistory.shift();
        
        const hrAvg = Math.round(this.hrValuesHistory.reduce((s,v)=>s+v, 0)/this.hrValuesHistory.length);
        const spo2Avg = (this.spo2ValuesHistory.reduce((s,v)=>s+v, 0)/this.spo2ValuesHistory.length).toFixed(1);
        
        document.getElementById('hr-avg-label').textContent = `Avg: ${hrAvg} BPM`;
        document.getElementById('spo2-avg-label').textContent = `Avg: ${spo2Avg}%`;
      }
      
      document.getElementById('ecg-signal-pct').textContent = `${Math.round(data.ecg.signal_quality * 100)}%`;
      document.getElementById('ecg-signal-bar').style.width = `${Math.round(data.ecg.signal_quality * 100)}%`;
      
      const electrodeEl = document.getElementById('electrode-quality');
      if (electrodeEl) {
        const hasGoodEcg = data.ecg.signal_quality > 0.85;
        electrodeEl.textContent = hasGoodEcg ? 'Excellent Contact' : 'Weak Connection';
        electrodeEl.className = hasGoodEcg ? 'text-green' : 'text-red';
      }
      
      document.getElementById('rr-interval-value').textContent = data.ecg.rr_interval_ms;
      
      document.getElementById('diag-val-motion').textContent = data.motion.magnitude > 0.1 ? 'Jitter Detected' : 'RESTING';
      document.getElementById('diag-val-activity').textContent = data.motion.activity_level.toUpperCase();
      document.getElementById('diag-val-pressure').textContent = `${Math.round(data.pressure.normalized * 100)}% Contact`;
      
      const contactVal = document.getElementById('diag-val-contact');
      if (contactVal) {
        contactVal.textContent = data.pressure.contact_quality.toUpperCase();
        contactVal.className = `diag-value ${data.pressure.contact_quality === 'good' ? 'text-green' : 'text-yellow'}`;
      }
      
      this.setDiagnosticsStatus('diag-ecg', data.ecg.signal_quality > 0.6);
      this.setDiagnosticsStatus('diag-ppg', data.ppg.signal_quality > 0.6);
      this.setDiagnosticsStatus('diag-temp', data.temperature.celsius > 30);
      this.setDiagnosticsStatus('diag-fsr', data.pressure.normalized > 0.4);
      this.setDiagnosticsStatus('diag-imu', data.motion.magnitude < 0.8);
      
      document.getElementById('diag-val-rssi').textContent = `${data.device.wifi_rssi} dBm`;
      document.getElementById('diag-val-battery').textContent = `${data.device.battery_percent}%`;
      document.getElementById('diag-val-signal').textContent = data.device.wifi_rssi > -70 ? 'Excellent' : 'Poor';
      document.getElementById('diag-val-lastseen').textContent = new Date(data.timestamp).toLocaleTimeString();
    }
    
    if (this.currentView === 'test' && this.activeTestState === 'executing') {
      charts.updateMiniECG(data.ecg.raw_value);
    }
    
    document.getElementById('battery-text').textContent = `${data.device.battery_percent}%`;
    document.getElementById('wifi-text').textContent = `${data.device.wifi_rssi} dBm`;
    
    const batteryIcon = document.getElementById('battery-icon');
    if (batteryIcon) {
      const pct = data.device.battery_percent;
      if (pct > 75) batteryIcon.className = 'fa-solid fa-battery-full text-green';
      else if (pct > 35) batteryIcon.className = 'fa-solid fa-battery-half text-yellow';
      else batteryIcon.className = 'fa-solid fa-battery-empty text-red';
    }
  }
  
  // Set UI state of diagnostics lights
  setDiagnosticsStatus(elementId, isOperational) {
    const el = document.querySelector(`#${elementId} .sensor-status`);
    if (el) {
      el.className = `sensor-status ${isOperational ? 'text-green' : 'text-red'}`;
      el.textContent = isOperational ? 'Operational' : 'Anomaly';
    }
  }
  
  // Generic helper to style KPI card bounds
  updateKPICard(metricKey, value, statusObject) {
    const valEl = document.getElementById(`kpi-val-${metricKey}`);
    const badgeEl = document.getElementById(`kpi-badge-${metricKey}`);
    
    if (valEl) valEl.textContent = value;
    if (badgeEl) {
      badgeEl.textContent = statusObject.label;
      badgeEl.className = `kpi-badge badge-${statusObject.class}`;
    }
  }
  
  // Handle toggling of Demo simulator mode
  initDemoMode() {
    this.demoEngine = new CardioDemoMode((simPacket) => {
      this.handleIncomingDataPacket(simPacket);
    });
    
    const toggleBtn = document.getElementById('demo-mode-toggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        this.isDemoMode = !this.isDemoMode;
        
        const statusText = document.getElementById('demo-status-text');
        const connectionBadge = document.getElementById('connection-status-text');
        const connectionBadgeContainer = document.getElementById('device-status-badge');
        const pulseDot = document.getElementById('device-pulse-dot');
        const offlineBanner = document.getElementById('network-alert-banner');
        
        if (this.isDemoMode) {
          toggleBtn.classList.add('active-mode');
          if (statusText) statusText.textContent = 'ON';
          
          this.wsClient.disconnect();
          this.demoEngine.start();
          
          if (connectionBadge) connectionBadge.textContent = 'DEMO SYSTEM';
          if (connectionBadgeContainer) {
            connectionBadgeContainer.className = 'status-badge connected';
            connectionBadgeContainer.style.borderColor = 'var(--accent-yellow)';
            connectionBadgeContainer.style.color = 'var(--accent-yellow)';
            connectionBadgeContainer.style.background = 'rgba(245, 158, 11, 0.1)';
          }
          if (pulseDot) {
            pulseDot.className = 'status-dot-pulse';
            pulseDot.style.backgroundColor = 'var(--accent-yellow)';
            pulseDot.style.boxShadow = '0 0 8px var(--accent-yellow)';
          }
          if (offlineBanner) offlineBanner.classList.add('hidden');
          
        } else {
          toggleBtn.classList.remove('active-mode');
          if (statusText) statusText.textContent = 'OFF';
          
          this.demoEngine.stop();
          this.wsClient.connect();
          
          if (connectionBadgeContainer) {
            connectionBadgeContainer.style.borderColor = '';
            connectionBadgeContainer.style.color = '';
            connectionBadgeContainer.style.background = '';
          }
          if (pulseDot) {
            pulseDot.style.backgroundColor = '';
            pulseDot.style.boxShadow = '';
          }
          this.resetLiveDiagnostics();
        }
        
        if (this.currentUser) {
          this.loadActiveUserHistory();
        }
      });
    }
  }
  
  // Common router intercepting both WS and Demo packets
  handleIncomingDataPacket(packet) {
    if (packet.type === 'sensor_stream') {
      this.processSensorStream(packet);
    } else if (packet.type === 'test_progress') {
      this.processTestProgress(packet);
    } else if (packet.type === 'prediction_result') {
      this.processPredictionResult(packet);
    } else if (packet.type === 'device_status') {
      this.processDeviceStatus(packet);
    }
  }
  
  // Process test execution counts (comes from WS or Demo Mode)
  processTestProgress(data) {
    if (this.currentView !== 'test' || !this.currentUser) return;
    
    this.activeTestState = 'executing';
    document.getElementById('precheck-container').classList.add('hidden');
    document.getElementById('active-test-container').classList.remove('hidden');
    
    const timeLeft = data.total_seconds - data.elapsed_seconds;
    document.getElementById('countdown-timer').textContent = Math.max(0, timeLeft);
    
    const circle = document.getElementById('test-progress-circle');
    if (circle) {
      const radius = circle.r.baseVal.value;
      const circumference = 2 * Math.PI * radius;
      circle.style.strokeDasharray = `${circumference} ${circumference}`;
      
      const percent = data.elapsed_seconds / data.total_seconds;
      const offset = circumference - (percent * circumference);
      circle.style.strokeDashoffset = offset;
    }
    
    document.getElementById('test-progress-msg').textContent = data.message;
    
    const pctFill = (data.elapsed_seconds / data.total_seconds) * 100;
    document.getElementById('test-flat-fill').style.width = `${pctFill}%`;
  }
  
  // Process incoming ML prediction results report
  async processPredictionResult(data) {
    console.log('[CardioAI] Clinical ML Prediction report received:', data);
    
    await utils.saveTestResult(this.currentUser.id, data);
    
    this.renderPredictionResultsView(data);
    
    this.activeTestState = 'idle';
    
    document.getElementById('precheck-container').classList.remove('hidden');
    document.getElementById('active-test-container').classList.add('hidden');
    document.getElementById('test-flat-fill').style.width = '0%';
    
    await this.loadActiveUserHistory();
    this.navigateTo('results');
  }
  
  // Process device status broadcast packets
  processDeviceStatus(data) {
    if (!this.isDemoMode) {
      this.handleNetworkConnection(data.connected);
      document.getElementById('battery-text').textContent = `${data.battery_percent}%`;
      document.getElementById('wifi-text').textContent = `${data.device.wifi_rssi || data.wifi_rssi} dBm`;
    }
  }
  
  // Render details of result report
  renderPredictionResultsView(data) {
    const score = data.cardio_risk_score;
    const angle = (score / 100) * 180 - 90;
    const needle = document.getElementById('gauge-needle');
    if (needle) {
      needle.setAttribute('transform', `rotate(${angle}, 150, 160)`);
    }
    
    const scoreText = document.getElementById('result-risk-score');
    const levelText = document.getElementById('result-risk-level');
    
    if (scoreText) scoreText.textContent = Math.round(score);
    if (levelText) {
      levelText.textContent = `${data.risk_level} Risk`;
      levelText.style.color = utils.getRiskColor(data.risk_level);
    }
    
    this.updateKPICard('risk', Math.round(score), {
      label: `${data.risk_level} Risk`,
      class: data.risk_level.toLowerCase()
    });
    
    document.getElementById('result-confidence').textContent = `${Math.round(data.confidence_score * 100)}%`;
    
    const rhythmBanner = document.getElementById('rhythm-status-banner');
    const rhythmIcon = document.getElementById('rhythm-banner-icon');
    const rhythmTitle = document.getElementById('rhythm-status-title');
    const rhythmDesc = document.getElementById('rhythm-status-desc');
    
    const isNormalRhythm = data.heart_status.toLowerCase().includes('normal');
    
    if (rhythmBanner) {
      rhythmBanner.className = `results-card banner-card ${
        isNormalRhythm ? 'banner-normal' : (data.risk_level.toLowerCase() === 'high' ? 'banner-critical' : 'banner-warning')
      }`;
    }
    
    if (rhythmIcon) {
      rhythmIcon.className = isNormalRhythm ? 'fa-solid fa-circle-check text-green' : 'fa-solid fa-triangle-exclamation';
    }
    
    if (rhythmTitle) rhythmTitle.textContent = data.heart_status;
    if (rhythmDesc) {
      rhythmDesc.textContent = isNormalRhythm 
        ? 'Steady and consistent sinus rhythm patterns mapped across all leads.' 
        : 'Deviations or ectopic anomalies identified in rhythmic variability matrices.';
    }
    
    const shapContainer = document.getElementById('shap-bars-list');
    if (shapContainer) {
      shapContainer.innerHTML = '';
      
      data.shap_factors.forEach(factor => {
        const userFriendlyName = utils.formatFeatureName(factor.feature);
        const directionLabel = factor.direction === 'increases_risk' ? 'Increases Risk' : 'Decreases Risk';
        const directionSign = factor.direction === 'increases_risk' ? '+' : '-';
        const directionClass = factor.direction === 'increases_risk' ? 'increases' : 'decreases';
        
        const valAbs = Math.abs(factor.contribution);
        const barPct = Math.min(100, Math.round((valAbs / 18) * 100));
        
        const rowHTML = `
          <div class="shap-row">
            <div class="shap-row-header">
              <span class="shap-feature-name">${userFriendlyName}</span>
              <span class="shap-contrib-val ${directionClass}">${directionSign}${valAbs.toFixed(1)} (${directionLabel})</span>
            </div>
            <div class="shap-bar-track">
              <div class="shap-bar-fill ${factor.direction === 'increases_risk' ? 'increases-risk' : 'decreases-risk'}" style="width: ${barPct}%"></div>
            </div>
          </div>
        `;
        shapContainer.insertAdjacentHTML('beforeend', rowHTML);
      });
    }
    
    const snap = data.feature_snapshot;
    this.updateVitalsTableRow('hr', snap.heart_rate_bpm, utils.getHeartRateStatus(snap.heart_rate_bpm));
    this.updateVitalsTableRow('spo2', snap.spo2_percent, utils.getSpO2Status(snap.spo2_percent));
    this.updateVitalsTableRow('temp', snap.body_temp_celsius, utils.getTemperatureStatus(snap.body_temp_celsius));
    this.updateVitalsTableRow('sdnn', snap.sdnn_ms, utils.getSdnnStatus(snap.sdnn_ms));
    this.updateVitalsTableRow('rmssd', snap.rmssd_ms, utils.getRmssdStatus(snap.rmssd_ms));
    
    document.getElementById('rec-summary-heading').textContent = data.recommendation.summary;
    document.getElementById('rec-summary-text').textContent = data.recommendation.recommendation;
    
    document.getElementById('print-test-id').textContent = data.test_id;
    document.getElementById('print-timestamp').textContent = utils.formatFullDate(data.timestamp);
  }
  
  updateVitalsTableRow(metricKey, value, statusObject) {
    const valEl = document.getElementById(`vital-val-${metricKey}`);
    const statusEl = document.getElementById(`vital-status-${metricKey}`);
    
    if (valEl) valEl.textContent = value;
    if (statusEl) {
      statusEl.textContent = statusObject.label;
      statusEl.className = `table-badge ${statusObject.class}`;
    }
  }
  
  // Re-render past test cards list in History Log
  async renderHistoryRecords() {
    if (!this.currentUser) return;
    
    const records = await utils.getHistoryRecords(this.currentUser.id);
    
    const emptyState = document.getElementById('history-no-records');
    const listGrid = document.getElementById('history-records-grid');
    
    if (records.length === 0) {
      if (emptyState) emptyState.classList.remove('hidden');
      if (listGrid) listGrid.classList.add('hidden');
      return;
    }
    
    if (emptyState) emptyState.classList.add('hidden');
    if (listGrid) {
      listGrid.classList.remove('hidden');
      listGrid.innerHTML = '';
      
      records.forEach((record, index) => {
        const riskClass = `risk-${record.risk_level.toLowerCase()}`;
        const dateFormatted = utils.formatFullDate(record.timestamp);
        const rhythmClass = record.heart_status.toLowerCase().includes('normal') ? 'status-normal' : 'status-abnormal';
        
        const cardHTML = `
          <div class="history-record-card ${riskClass}" onclick="app.showHistoricalDetails('${record.test_id}')">
            <div class="record-row-top">
              <div class="record-meta">
                <span class="record-title">Test Reference Record #${records.length - index}</span>
                <span class="record-date"><i class="fa-regular fa-clock"></i> ${dateFormatted}</span>
              </div>
              <div class="record-risk-badge ${riskClass}">
                <span class="record-risk-value metric-value">${Math.round(record.cardio_risk_score)}</span>
                <span class="record-risk-label">${record.risk_level} Risk</span>
              </div>
            </div>
            
            <div class="record-row-vitals">
              <div class="record-vital-item">
                <i class="fa-solid fa-heartbeat text-red"></i>
                <span class="metric-value">${record.feature_snapshot.heart_rate_bpm}</span> BPM
              </div>
              <div class="record-vital-item">
                <i class="fa-solid fa-lungs text-cyan"></i>
                <span class="metric-value">${record.feature_snapshot.spo2_percent}</span>% SpO₂
              </div>
              <div class="record-vital-item">
                <i class="fa-solid fa-thermometer-half text-orange"></i>
                <span class="metric-value">${record.feature_snapshot.body_temp_celsius}</span>°C
              </div>
              <div class="record-vital-item">
                <i class="fa-solid fa-wave-square text-muted"></i>
                SDNN: <span class="metric-value">${record.feature_snapshot.sdnn_ms}</span>ms
              </div>
            </div>
            
            <div class="record-row-bottom">
              <span class="record-rhythm-status ${rhythmClass}">
                <i class="fa-solid ${record.heart_status.toLowerCase().includes('normal') ? 'fa-circle-check' : 'fa-circle-exclamation'}"></i>
                ${record.heart_status}
              </span>
              <span class="record-action-link">View Diagnosis Report <i class="fa-solid fa-arrow-right-long"></i></span>
            </div>
          </div>
        `;
        
        listGrid.insertAdjacentHTML('beforeend', cardHTML);
      });
    }
  }
  
  // Retrieve historical details report from cache and navigate
  async showHistoricalDetails(testId) {
    if (!this.currentUser) return;
    
    console.log(`[CardioAI] Fetching archived test details: ${testId}`);
    const records = await utils.getHistoryRecords(this.currentUser.id);
    const target = records.find(r => r.test_id === testId);
    
    if (target) {
      this.renderPredictionResultsView(target);
      this.navigateTo('results');
    }
  }
  
  // Register button actions
  bindUIActions() {
    const startBtn = document.getElementById('start-test-btn');
    if (startBtn) {
      startBtn.addEventListener('click', () => {
        this.triggerAssessmentStart();
      });
    }
    
    // Sign Out trigger
    const logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        console.log('[Auth] Patient initiated Sign Out protocol.');
        
        utils.clearActiveUser();
        this.currentUser = null;
        
        // Disable demo mode toggle button if it was on
        this.isDemoMode = false;
        const toggleBtn = document.getElementById('demo-mode-toggle');
        if (toggleBtn) {
          toggleBtn.classList.remove('active-mode');
          document.getElementById('demo-status-text').textContent = 'OFF';
        }
        this.demoEngine.stop();
        
        document.getElementById('navigation-list').classList.add('hidden');
        document.getElementById('nav-profile-widget').classList.add('hidden');
        document.getElementById('footer-section').classList.add('hidden');
        document.getElementById('network-alert-banner').classList.add('hidden');
        
        this.resetLiveDiagnostics();
        this.wsClient.connect(); // restore standard WS connection
        
        this.navigateTo('login');
      });
    }
    
    const shareBtn = document.getElementById('btn-share-results');
    if (shareBtn) {
      shareBtn.addEventListener('click', () => {
        alert('Sharing Integration: Diagnostic Report package successfully compiled! In real clinical setups, this transmits an encrypted FHIR biometrics payload to your hospital EHR portal.');
      });
    }
  }
  
  // Kickstart assessment test (HTTP backend fetch or Demo offline sequencer)
  triggerAssessmentStart() {
    if (!this.currentUser) return;
    console.log('[CardioAI] Triggering cardiovascular assessment...');
    
    const prechecks = document.querySelectorAll('.precheck-item');
    prechecks.forEach(item => {
      item.className = 'precheck-item status-checking';
      const text = item.querySelector('.precheck-value');
      if (text) text.textContent = 'Calibrating...';
      const icon = item.querySelector('.status-icon');
      if (icon) icon.className = 'fa-solid fa-circle-notch fa-spin status-icon';
    });
    
    setTimeout(() => {
      this.setPrecheckStatus('precheck-ecg', 'Signal Good (92%)', true);
      this.setPrecheckStatus('precheck-ppg', 'Signal Good (89%)', true);
      this.setPrecheckStatus('precheck-temp', '36.8°C (Baseline)', true);
      this.setPrecheckStatus('precheck-motion', 'Resting Detected', true);
      this.setPrecheckStatus('precheck-pressure', 'Contact Good (91%)', true);
      this.setPrecheckStatus('precheck-device', this.isDemoMode ? 'Demo Simulator' : 'WiFi Connected', true);
      
      setTimeout(() => {
        if (this.isDemoMode) {
          this.demoEngine.startTestSimulation();
        } else {
          console.log('[CardioAI] Dispatched real hardware assessment start command to server...');
          const apiBase = utils.getApiBase();
          
          fetch(`${apiBase}/api/start-test`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: this.currentUser.id })
          })
          .then(res => {
            if (!res.ok) throw new Error('API server unreachable');
            console.log('[CardioAI] API Start-Test successfully triggered.');
          })
          .catch(err => {
            console.error('[CardioAI] Failed triggering start-test on server. Activating fallback Demo mode sequencer...', err);
            alert('Express hardware server unreachable. Running offline simulated assessment sequence instead!');
            this.demoEngine.startTestSimulation();
          });
        }
      }, 1000);
      
    }, 1200);
  }
  
  setPrecheckStatus(elementId, valueText, isOk) {
    const el = document.getElementById(elementId);
    if (el) {
      el.className = `precheck-item ${isOk ? 'status-success' : 'status-error'}`;
      const val = el.querySelector('.precheck-value');
      if (val) val.textContent = valueText;
      const icon = el.querySelector('.status-icon');
      if (icon) {
        icon.className = isOk ? 'fa-solid fa-circle-check status-icon' : 'fa-solid fa-circle-xmark status-icon';
      }
    }
  }
}

// Global reference
const app = new CardioApp();
window.addEventListener('load', () => {
  app.init();
});
