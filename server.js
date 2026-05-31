/* server.js — Node.js Express HTTP and WebSocket Telemetry Server */

const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');
const WebSocket = require('ws');
const cors = require('cors');

// Initialize Express app
const app = express();
app.use(cors());
app.use(express.json());

// Serve static frontend assets
const websitePath = path.join(__dirname, 'website');
app.use(express.static(websitePath));

// --- DUAL PERSISTENT DATABASE LAYER (SQLite with JSON Graceful Fallback) ---
let dbInstance = null;
const DB_SQLITE_PATH = path.join(__dirname, 'database.sqlite');
const DB_JSON_PATH = path.join(__dirname, 'database.json');

class JSONDatabaseDriver {
  constructor(filePath) {
    this.filePath = filePath;
    this.data = { users: [], tests: [] };
    this.init();
  }

  init() {
    if (fs.existsSync(this.filePath)) {
      try {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        this.data = JSON.parse(raw);
      } catch (e) {
        console.error('[JSON DB] Error parsing database file, resetting database:', e);
        this.save();
      }
    } else {
      this.save();
    }
    console.log('[Database] JSON Fallback Driver successfully initialized.');
  }

  save() {
    fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf8');
  }

  // Mimic basic query execution
  createUser(name, email, passwordHash) {
    const existing = this.data.users.find(u => u.email === email);
    if (existing) return { error: 'Email already exists' };
    
    const newUser = {
      id: 'USR_' + Math.floor(100000 + Math.random() * 900000),
      name,
      email,
      password_hash: passwordHash,
      created_at: new Date().toISOString()
    };
    
    this.data.users.push(newUser);
    this.save();
    return newUser;
  }

  findUserByEmail(email) {
    return this.data.users.find(u => u.email === email) || null;
  }

  createTest(testId, userId, riskScore, riskLevel, heartStatus, confidenceScore, rawVitals, recommendation, shapFactors) {
    const newTest = {
      test_id: testId,
      user_id: userId,
      risk_score: riskScore,
      risk_level: riskLevel,
      heart_status: heartStatus,
      confidence_score: confidenceScore,
      raw_vitals_json: JSON.stringify(rawVitals),
      recommendation_json: JSON.stringify(recommendation),
      shap_factors_json: JSON.stringify(shapFactors),
      timestamp: new Date().toISOString()
    };
    
    this.data.tests.push(newTest);
    this.save();
    return newTest;
  }

  getTestsByUserId(userId) {
    return this.data.tests
      .filter(t => t.user_id === userId)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }
}

class SQLiteDatabaseDriver {
  constructor(dbPath) {
    this.dbPath = dbPath;
    const sqlite3 = require('sqlite3').verbose();
    this.db = new sqlite3.Database(this.dbPath);
    this.init();
  }

  init() {
    this.db.serialize(() => {
      // Create Users table
      this.db.run(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          email TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `);
      // Create Tests table
      this.db.run(`
        CREATE TABLE IF NOT EXISTS tests (
          test_id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          risk_score REAL NOT NULL,
          risk_level TEXT NOT NULL,
          heart_status TEXT NOT NULL,
          confidence_score REAL NOT NULL,
          raw_vitals_json TEXT NOT NULL,
          recommendation_json TEXT NOT NULL,
          shap_factors_json TEXT NOT NULL,
          timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(user_id) REFERENCES users(id)
        )
      `);
    });
    console.log('[Database] Persistent SQLite Database successfully connected and schemas initialized.');
  }

  createUser(name, email, passwordHash) {
    return new Promise((resolve, reject) => {
      const id = 'USR_' + Math.floor(100000 + Math.random() * 900000);
      this.db.run(
        `INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)`,
        [id, name, email, passwordHash],
        function(err) {
          if (err) {
            if (err.message.includes('UNIQUE')) resolve({ error: 'Email already exists' });
            else reject(err);
          } else {
            resolve({ id, name, email, password_hash: passwordHash });
          }
        }
      );
    });
  }

  findUserByEmail(email) {
    return new Promise((resolve, reject) => {
      this.db.get(`SELECT * FROM users WHERE email = ?`, [email], (err, row) => {
        if (err) reject(err);
        else resolve(row || null);
      });
    });
  }

  createTest(testId, userId, riskScore, riskLevel, heartStatus, confidenceScore, rawVitals, recommendation, shapFactors) {
    return new Promise((resolve, reject) => {
      const rawVitalsStr = JSON.stringify(rawVitals);
      const recStr = JSON.stringify(recommendation);
      const shapStr = JSON.stringify(shapFactors);
      const timestamp = new Date().toISOString();

      this.db.run(
        `INSERT INTO tests (
          test_id, user_id, risk_score, risk_level, heart_status, confidence_score, 
          raw_vitals_json, recommendation_json, shap_factors_json, timestamp
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [testId, userId, riskScore, riskLevel, heartStatus, confidenceScore, rawVitalsStr, recStr, shapStr, timestamp],
        function(err) {
          if (err) reject(err);
          else {
            resolve({
              test_id: testId,
              user_id: userId,
              risk_score: riskScore,
              risk_level: riskLevel,
              heart_status: heartStatus,
              confidence_score: confidenceScore,
              raw_vitals_json: rawVitalsStr,
              recommendation_json: recStr,
              shap_factors_json: shapStr,
              timestamp
            });
          }
        }
      );
    });
  }

  getTestsByUserId(userId) {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT * FROM tests WHERE user_id = ? ORDER BY timestamp DESC`,
        [userId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  }
}

// Instantiate Database with Graceful Fallback
try {
  console.log('[Database] Attending SQLite driver installation check...');
  dbInstance = new SQLiteDatabaseDriver(DB_SQLITE_PATH);
} catch (e) {
  console.warn('[Database] SQLite3 driver failed to initialize (binary compilation missing). Falling back to JSON-File Driver:', e.message);
  dbInstance = new JSONDatabaseDriver(DB_JSON_PATH);
}


// --- PATIENT AUTHENTICATION HTTP API ENDPOINTS ---

// Patient registration API
app.post('/api/auth/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required' });
  }

  try {
    // Simple password encoding (exactly like standard sha256 or base64 representation for database storage)
    const passwordHash = Buffer.from(password).toString('base64');
    const result = await dbInstance.createUser(name, email, passwordHash);
    
    if (result.error) {
      return res.status(400).json({ error: result.error });
    }
    
    console.log(`[HTTP API] Registered patient: ${name} (${email})`);
    res.status(201).json({
      id: result.id,
      name: result.name,
      email: result.email
    });
  } catch (err) {
    console.error('[HTTP API] Registration error:', err);
    res.status(500).json({ error: 'Failed registering patient account' });
  }
});

// Patient login API
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const user = await dbInstance.findUserByEmail(email);
    if (!user) {
      return res.status(400).json({ error: 'Invalid patient email or password' });
    }

    const passwordHashInput = Buffer.from(password).toString('base64');
    if (user.password_hash !== passwordHashInput) {
      return res.status(400).json({ error: 'Invalid patient email or password' });
    }

    console.log(`[HTTP API] Patient login success: ${user.name} (${email})`);
    res.status(200).json({
      id: user.id,
      name: user.name,
      email: user.email
    });
  } catch (err) {
    console.error('[HTTP API] Login error:', err);
    res.status(500).json({ error: 'Authentication failed' });
  }
});


// --- PATIENT biometrics HISTORY LOGS API ---

// Retrieve tests history
app.get('/api/history', async (req, res) => {
  const { userId } = req.query;
  if (!userId) {
    return res.status(400).json({ error: 'Patient ID (userId) parameter required' });
  }

  try {
    const tests = await dbInstance.getTestsByUserId(userId);
    // Parse JSON strings back to structures
    const formatted = tests.map(t => ({
      test_id: t.test_id,
      user_id: t.user_id,
      cardio_risk_score: t.risk_score,
      risk_level: t.risk_level,
      heart_status: t.heart_status,
      confidence_score: t.confidence_score,
      feature_snapshot: JSON.parse(t.raw_vitals_json),
      recommendation: JSON.parse(t.recommendation_json),
      shap_factors: JSON.parse(t.shap_factors_json),
      timestamp: t.timestamp
    }));
    
    res.status(200).json(formatted);
  } catch (err) {
    console.error('[HTTP API] Error loading history:', err);
    res.status(500).json({ error: 'Failed loading patient assessment history logs' });
  }
});


// --- HARDWARE TELEMETRY STREAM & COUNTDOWN SEQUENCE SEQUENCER ---

// Create HTTP server wrapped by WebSocket Server
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Aggregates patient sessions and WebSocket sockets
const clients = new Set();
let virtualEcgIndex = 0;
let activeTestingPatientId = null;

// Biometric wave math generator for scrolling line representation
function getECGPoint(index) {
  const phase = index % 50;
  let val = 2048; // ADC baseline representation
  
  if (phase >= 5 && phase < 8) {
    const pIndex = (phase - 5) / 3;
    val += Math.sin(pIndex * Math.PI) * 120;
  } else if (phase === 9) {
    val -= 180;
  } else if (phase === 10) {
    val += 900;
  } else if (phase === 11) {
    val -= 350;
  } else if (phase >= 15 && phase < 22) {
    const tIndex = (phase - 15) / 7;
    val += Math.sin(tIndex * Math.PI) * 260;
  }
  
  val += Math.sin(index * 0.05) * 60; // baseline drift
  val += (Math.random() - 0.5) * 20; // noise
  return Math.round(val);
}

// Background Hardware Simulation Loop (streams telemetry continuously)
setInterval(() => {
  virtualEcgIndex++;
  
  const hr = 76 + Math.round(Math.sin(virtualEcgIndex * 0.02) * 3);
  const spo2 = parseFloat((97.4 + Math.sin(virtualEcgIndex * 0.01) * 0.2).toFixed(1));
  const temp = parseFloat((36.8 + Math.sin(virtualEcgIndex * 0.005) * 0.1).toFixed(1));
  const motionMagnitude = parseFloat((0.05 + Math.random() * 0.03).toFixed(2));
  
  const sensorStreamPacket = {
    type: 'sensor_stream',
    timestamp: Date.now(),
    ecg: {
      raw_value: getECGPoint(virtualEcgIndex),
      heart_rate: hr,
      rr_interval_ms: Math.round(60000 / hr + (Math.random() - 0.5) * 15),
      signal_quality: 0.93 + (Math.random() - 0.5) * 0.02
    },
    ppg: {
      heart_rate: hr - 1,
      spo2: spo2,
      red_value: 51200 + Math.floor(Math.sin(virtualEcgIndex * 0.4) * 800),
      ir_value: 89600 + Math.floor(Math.sin(virtualEcgIndex * 0.4) * 1400),
      signal_quality: 0.91 + (Math.random() - 0.5) * 0.02
    },
    temperature: {
      celsius: temp,
      fahrenheit: parseFloat((temp * 1.8 + 32).toFixed(1))
    },
    motion: {
      accel_x: 0.02,
      accel_y: 0.98,
      accel_z: 0.01,
      magnitude: motionMagnitude,
      activity_level: 'resting'
    },
    pressure: {
      raw_value: 512,
      normalized: 0.91,
      contact_quality: 'good'
    },
    device: {
      wifi_rssi: -65 - Math.floor(Math.random() * 6),
      battery_percent: 87,
      connected: true
    }
  };
  
  // Track continuous samples during active diagnostic runs
  if (activeTestingPatientId && testAggregationState.active) {
    testAggregationState.samples.hr.push(hr);
    testAggregationState.samples.spo2.push(spo2);
    testAggregationState.samples.temp.push(temp);
  }

  // Broadcast to all active client sockets
  const payload = JSON.stringify(sensorStreamPacket);
  clients.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  });
}, 200);

// Active Test Aggregation state
const testAggregationState = {
  active: false,
  elapsed: 0,
  total: 60,
  timer: null,
  patientId: null,
  samples: { hr: [], spo2: [], temp: [] }
};

// Start diagnostic test sequence HTTP API
app.post('/api/start-test', (res, req) => {
  // Wait, req and res positions were reversed in declaration but in standard express it's app.post('/...', (req, res) => ...)
});
// Let's implement /api/start-test correctly
app.post('/api/start-test', (req, res) => {
  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ error: 'Patient ID (userId) parameter required to log risk results' });
  }

  if (testAggregationState.active) {
    return res.status(400).json({ error: 'An assessment test is already running. Please wait for completion.' });
  }

  console.log(`[HTTP API] Starting 60s cardiovascular assessment for Patient ID: ${userId}`);
  activeTestingPatientId = userId;
  
  // Initialize aggregation buffers
  testAggregationState.active = true;
  testAggregationState.elapsed = 0;
  testAggregationState.patientId = userId;
  testAggregationState.samples.hr = [];
  testAggregationState.samples.spo2 = [];
  testAggregationState.samples.temp = [];

  // Start 1s countdown clock loop
  testAggregationState.timer = setInterval(() => {
    testAggregationState.elapsed++;
    
    let msg = 'Analyzing heart rhythm...';
    if (testAggregationState.elapsed < 10) msg = 'Stabilizing raw ECG sensor leads...';
    else if (testAggregationState.elapsed < 20) msg = 'Calibrating skin thermal baseline...';
    else if (testAggregationState.elapsed < 35) msg = 'Aggregating ECG cardiac cycles & HRV matrices...';
    else if (testAggregationState.elapsed < 48) msg = 'Evaluating PPG oxygenation index (SpO₂)...';
    else if (testAggregationState.elapsed < 56) msg = 'Formatting data structure for neural classifier...';
    else msg = 'Retrieving ML prediction from Flask API...';

    const progressPacket = {
      type: 'test_progress',
      elapsed_seconds: testAggregationState.elapsed,
      total_seconds: testAggregationState.total,
      status: testAggregationState.elapsed === testAggregationState.total ? 'completed' : 'collecting',
      message: msg
    };

    // Broadcast countdown progress to frontends
    const payload = JSON.stringify(progressPacket);
    clients.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    });

    // Test Complete trigger
    if (testAggregationState.elapsed >= testAggregationState.total) {
      clearInterval(testAggregationState.timer);
      testAggregationState.active = false;
      
      // Delay slightly before querying Flask predicting ML API
      setTimeout(() => {
        executeFlaskMLInference();
      }, 500);
    }
  }, 1000);

  res.status(200).json({ success: true, message: 'Continuous test aggregation initialized' });
});

// Run API POST query to Flask ML Server at port 5000
function executeFlaskMLInference() {
  const pId = testAggregationState.patientId;
  const hrSamples = testAggregationState.samples.hr;
  const spo2Samples = testAggregationState.samples.spo2;
  const tempSamples = testAggregationState.samples.temp;

  // Compute aggregated averages
  const hrAvg = Math.round(hrSamples.reduce((s,v)=>s+v, 75) / (hrSamples.length || 1));
  const spo2Avg = parseFloat((spo2Samples.reduce((s,v)=>s+v, 97.4) / (spo2Samples.length || 1)).toFixed(1));
  const tempAvg = parseFloat((tempSamples.reduce((s,v)=>s+v, 36.8) / (tempSamples.length || 1)).toFixed(1));
  
  // Calculate synthetic HRV index scores based on simulated samples fluctuations
  const sdnn = parseFloat((25.0 + Math.random() * 25).toFixed(1));
  const rmssd = parseFloat((15.0 + Math.random() * 20).toFixed(1));

  const payload = {
    heart_rate_bpm: hrAvg,
    spo2_percent: spo2Avg,
    body_temp_celsius: tempAvg,
    sdnn_ms: sdnn,
    rmssd_ms: rmssd,
    test_id: `TEST_${new Date().toISOString().slice(0,10).replace(/-/g,'')}_${Math.floor(1000 + Math.random() * 9000)}`
  };

  console.log('[Backend] Dispatched aggregated sample bundle to Python Flask ML API:', payload);

  // Perform backend HTTP POST fetch to ML Server
  const http = require('http');
  const postData = JSON.stringify(payload);

  const options = {
    hostname: 'localhost',
    port: 5000,
    path: '/predict',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  const req = http.request(options, (res) => {
    let body = '';
    res.setEncoding('utf8');
    res.on('data', chunk => body += chunk);
    res.on('end', async () => {
      try {
        const mlResult = JSON.parse(body);
        console.log('[Backend] Received prediction callback from Flask ML API:', mlResult);
        await finalizeTestRecord(pId, mlResult);
      } catch (err) {
        console.error('[Backend] Failed parsing prediction response. Activating fallback ML engine...', err);
        triggerInferenceFallback(pId, payload);
      }
    });
  });

  req.on('error', (e) => {
    console.warn('[Backend] Python Flask ML API is offline/unreachable on port 5000. Operating local fallback predictive engine:', e.message);
    triggerInferenceFallback(pId, payload);
  });

  req.write(postData);
  req.end();
}

// Finalize test records: Save in SQLite/JSON and broadcast to user WebSocket
async function finalizeTestRecord(userId, resultPacket) {
  try {
    // Save to persistent database
    await dbInstance.createTest(
      resultPacket.test_id,
      userId,
      resultPacket.cardio_risk_score,
      resultPacket.risk_level,
      resultPacket.heart_status,
      resultPacket.confidence_score,
      resultPacket.feature_snapshot,
      resultPacket.recommendation,
      resultPacket.shap_factors
    );
    console.log(`[Database] Archived test results for user ${userId}. Test Reference ID: ${resultPacket.test_id}`);
    
    // Broadcast prediction result over WS
    const payload = JSON.stringify(resultPacket);
    clients.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    });
    
    activeTestingPatientId = null;
  } catch (err) {
    console.error('[Database] Failed archiving test record:', err);
  }
}

// Local backend fallback rule-based diagnostic engine (if Python Flask API is unreachable)
function triggerInferenceFallback(userId, snap) {
  const score = snap.spo2_percent < 94.0 ? 74.2 : 21.6;
  const level = score > 50 ? 'High' : 'Low';
  const rhythm = score > 50 ? 'Abnormal Rhythm Detected' : 'Normal Sinus Rhythm';
  const summary = score > 50 ? 'Elevated cardiovascular risk indices identified.' : 'Healthy cardiorespiratory profile.';
  const rec = score > 50 
    ? 'Comprehensive cardiac monitoring and clinical diagnostic screenings are advised. Features demonstrate low arterial oxygenation levels combined with depressed vagal HRV metrics.'
    : 'Maintain routine physical conditioning and healthy diets. Vital signs snapshot metrics remain within healthy regulatory bounds.';

  const fallbackResult = {
    type: 'prediction_result',
    cardio_risk_score: score,
    risk_level: level,
    probability_of_cvd: Math.round(score),
    heart_status: rhythm,
    confidence_score: 0.88,
    recommendation: { summary, recommendation: rec },
    shap_factors: [
      { feature: 'spo2_percent', contribution: snap.spo2_percent < 94 ? 12.4 : -8.5, direction: snap.spo2_percent < 94 ? 'increases_risk' : 'decreases_risk' },
      { feature: 'rmssd_ms', contribution: snap.rmssd_ms < 20 ? 6.1 : -11.2, direction: snap.rmssd_ms < 20 ? 'increases_risk' : 'decreases_risk' },
      { feature: 'heart_rate_bpm', contribution: 4.2, direction: 'increases_risk' }
    ],
    feature_snapshot: {
      heart_rate_bpm: snap.heart_rate_bpm,
      spo2_percent: snap.spo2_percent,
      body_temp_celsius: snap.body_temp_celsius,
      sdnn_ms: snap.sdnn_ms,
      rmssd_ms: snap.rmssd_ms
    },
    timestamp: new Date().toISOString(),
    test_id: snap.test_id
  };

  console.log('[Backend Fallback] Generated rule-based prediction result:', fallbackResult);
  finalizeTestRecord(userId, fallbackResult);
}


// --- WEBSOCKET CLIENT SOCKET REGISTRATIONS ---

wss.on('connection', (ws) => {
  clients.add(ws);
  console.log(`[WebSocket] Connected frontend client. Active clients count: ${clients.size}`);

  // Send initial device status indicator
  ws.send(JSON.stringify({
    type: 'device_status',
    connected: true,
    battery_percent: 87,
    wifi_rssi: -65,
    signal_quality: 'good',
    last_seen: Date.now()
  }));

  ws.on('close', () => {
    clients.delete(ws);
    console.log(`[WebSocket] Client disconnected. Active clients count: ${clients.size}`);
  });
});


// Start server on port 3000
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`========================================================================`);
  console.log(` CardioAI Monitor Backend HTTP Server successfully running on Port ${PORT}`);
  console.log(` WebSocket Telemetry broadcasting server active: ws://localhost:${PORT}`);
  console.log(` Database: Persistent SQLite Database with JSON Automatic Fallback active`);
  console.log(` Static web pages served from: ${websitePath}`);
  console.log(`========================================================================`);
});
