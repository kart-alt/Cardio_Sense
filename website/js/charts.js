/* js/charts.js — Chart.js Management Module */

const charts = {
  ecgChart: null,
  hrTrendChart: null,
  spo2TrendChart: null,
  historyTrendChart: null,
  testMiniECGChart: null,

  // Initialize all Chart.js instances across the application
  initAll() {
    console.log('[Charts] Initializing all chart canvases...');
    
    // 1. ECG Real-time Waveform Chart
    const ecgCtx = document.getElementById('ecgWaveformChart')?.getContext('2d');
    if (ecgCtx) {
      this.ecgChart = new Chart(ecgCtx, {
        type: 'line',
        data: {
          labels: Array(250).fill(''), // Pre-populate labels for smooth scrolling
          datasets: [{
            label: 'ECG',
            data: Array(250).fill(null), // Pre-populate with empty slots
            borderColor: '#00E5FF',
            borderWidth: 1.5,
            pointRadius: 0,
            tension: 0.15,
            fill: false
          }]
        },
        options: {
          animation: false,
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { enabled: false }
          },
          scales: {
            x: {
              display: false
            },
            y: {
              grid: {
                color: 'rgba(255, 255, 255, 0.04)',
                drawBorder: false
              },
              ticks: {
                color: '#6B7280',
                font: { family: 'JetBrains Mono', size: 9 },
                stepSize: 400
              },
              min: 1500,
              max: 3200
            }
          }
        }
      });
    }

    // 2. Heart Rate Trend Chart
    const hrCtx = document.getElementById('hrTrendChart')?.getContext('2d');
    if (hrCtx) {
      this.hrTrendChart = new Chart(hrCtx, {
        type: 'line',
        data: {
          labels: [],
          datasets: [{
            label: 'Heart Rate',
            data: [],
            borderColor: '#10B981',
            backgroundColor: 'rgba(16, 185, 129, 0.05)',
            fill: true,
            tension: 0.4,
            borderWidth: 2,
            pointRadius: 1,
            pointHoverRadius: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: '#111827',
              borderColor: '#1F2937',
              borderWidth: 1,
              titleFont: { family: 'Space Grotesk' },
              bodyFont: { family: 'JetBrains Mono' }
            }
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: { color: '#6B7280', font: { size: 9 } }
            },
            y: {
              grid: { color: 'rgba(255, 255, 255, 0.03)' },
              ticks: {
                color: '#6B7280',
                font: { family: 'JetBrains Mono', size: 9 }
              },
              suggestedMin: 50,
              suggestedMax: 110
            }
          }
        }
      });
    }

    // 3. SpO₂ Trend Chart
    const spo2Ctx = document.getElementById('spo2TrendChart')?.getContext('2d');
    if (spo2Ctx) {
      this.spo2TrendChart = new Chart(spo2Ctx, {
        type: 'line',
        data: {
          labels: [],
          datasets: [{
            label: 'SpO₂',
            data: [],
            borderColor: '#00E5FF',
            backgroundColor: 'rgba(0, 229, 255, 0.05)',
            fill: true,
            tension: 0.4,
            borderWidth: 2,
            pointRadius: 1,
            pointHoverRadius: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: '#111827',
              borderColor: '#1F2937',
              borderWidth: 1,
              titleFont: { family: 'Space Grotesk' },
              bodyFont: { family: 'JetBrains Mono' }
            }
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: { color: '#6B7280', font: { size: 9 } }
            },
            y: {
              grid: { color: 'rgba(255, 255, 255, 0.03)' },
              ticks: {
                color: '#6B7280',
                font: { family: 'JetBrains Mono', size: 9 }
              },
              suggestedMin: 90,
              suggestedMax: 100
            }
          }
        }
      });
    }

    // 4. Test Mini ECG Waveform Chart
    const miniCtx = document.getElementById('testMiniECGChart')?.getContext('2d');
    if (miniCtx) {
      this.testMiniECGChart = new Chart(miniCtx, {
        type: 'line',
        data: {
          labels: Array(60).fill(''),
          datasets: [{
            label: 'ECG Stream',
            data: Array(60).fill(null),
            borderColor: '#00E5FF',
            borderWidth: 1.5,
            pointRadius: 0,
            tension: 0.1,
            fill: false
          }]
        },
        options: {
          animation: false,
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { enabled: false }
          },
          scales: {
            x: { display: false },
            y: { display: false }
          }
        }
      });
    }

    // 5. Longitudinal Test Risk Score History Trend Chart
    const historyCtx = document.getElementById('historyRiskTrendChart')?.getContext('2d');
    if (historyCtx) {
      this.historyTrendChart = new Chart(historyCtx, {
        type: 'line',
        data: {
          labels: [],
          datasets: [{
            label: 'Cardio Risk Score',
            data: [],
            borderColor: '#EF4444',
            backgroundColor: 'rgba(239, 68, 68, 0.05)',
            borderWidth: 3,
            pointBackgroundColor: '#F9FAFB',
            pointRadius: 5,
            pointHoverRadius: 8,
            tension: 0.25,
            fill: true
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: '#111827',
              borderColor: '#1F2937',
              borderWidth: 1,
              titleFont: { family: 'Space Grotesk', size: 12 },
              bodyFont: { family: 'Space Grotesk', size: 14, weight: 'bold' },
              callbacks: {
                label: function(context) {
                  return ` Risk Score: ${context.parsed.y} / 100`;
                }
              }
            }
          },
          scales: {
            x: {
              grid: { color: 'rgba(255, 255, 255, 0.03)' },
              ticks: { color: '#9CA3AF', font: { family: 'Space Grotesk' } }
            },
            y: {
              grid: { color: 'rgba(255, 255, 255, 0.03)' },
              ticks: {
                color: '#9CA3AF',
                font: { family: 'JetBrains Mono' }
              },
              min: 0,
              max: 100
            }
          }
        }
      });
    }
  },

  // Update function (call every 200ms on raw ECG updates)
  updateECG(newValue) {
    if (!this.ecgChart) return;
    
    const data = this.ecgChart.data.datasets[0].data;
    data.push(newValue);
    data.shift(); // keep shifting array
    
    this.ecgChart.update('none'); // redraw immediately without animations
  },

  // Update function for mini ECG waveform on the test page
  updateMiniECG(newValue) {
    if (!this.testMiniECGChart) return;
    
    const data = this.testMiniECGChart.data.datasets[0].data;
    data.push(newValue);
    data.shift();
    
    this.testMiniECGChart.update('none');
  },

  // Dynamically feed Heart Rate Trend chart
  appendHeartRateTrend(timestampLabel, bpm) {
    if (!this.hrTrendChart) return;
    
    const maxDataPoints = 60; // scroll last 60 records
    const chartData = this.hrTrendChart.data;
    
    chartData.labels.push(timestampLabel);
    chartData.datasets[0].data.push(bpm);
    
    if (chartData.datasets[0].data.length > maxDataPoints) {
      chartData.labels.shift();
      chartData.datasets[0].data.shift();
    }
    
    // Dynamic color tuning based on average or current bounds
    const normalGreen = '#10B981';
    const warningYellow = '#F59E0B';
    const criticalRed = '#EF4444';
    
    const color = bpm < 50 || bpm > 120 ? criticalRed : (bpm < 60 || bpm > 100 ? warningYellow : normalGreen);
    chartData.datasets[0].borderColor = color;
    
    this.hrTrendChart.update('none');
  },

  // Dynamically feed SpO₂ Trend chart
  appendSpO2Trend(timestampLabel, spo2) {
    if (!this.spo2TrendChart) return;
    
    const maxDataPoints = 60;
    const chartData = this.spo2TrendChart.data;
    
    chartData.labels.push(timestampLabel);
    chartData.datasets[0].data.push(spo2);
    
    if (chartData.datasets[0].data.length > maxDataPoints) {
      chartData.labels.shift();
      chartData.datasets[0].data.shift();
    }
    
    const normalCyan = '#00E5FF';
    const warningYellow = '#F59E0B';
    const criticalRed = '#EF4444';
    
    const color = spo2 < 90 ? criticalRed : (spo2 < 95 ? warningYellow : normalCyan);
    chartData.datasets[0].borderColor = color;
    
    this.spo2TrendChart.update('none');
  },

  // Re-build historical longitudinal trend line
  renderHistoryTrend() {
    if (!this.historyTrendChart) return;
    
    const records = utils.getHistoryRecords().slice().reverse(); // Show chronologically
    
    const labels = records.map(r => new Date(r.timestamp).toLocaleDateString([], { day: '2-digit', month: 'short' }));
    const scores = records.map(r => r.cardio_risk_score);
    
    this.historyTrendChart.data.labels = labels;
    this.historyTrendChart.data.datasets[0].data = scores;
    
    // Set dynamic color of line based on average risk of historic tests
    if (scores.length > 0) {
      const avg = scores.reduce((sum, s) => sum + s, 0) / scores.length;
      const color = avg > 70 ? '#EF4444' : (avg > 30 ? '#F59E0B' : '#10B981');
      this.historyTrendChart.data.datasets[0].borderColor = color;
      this.historyTrendChart.data.datasets[0].backgroundColor = `${color}0D`; // 5% opacity fill
    }
    
    this.historyTrendChart.update();
  }
};
