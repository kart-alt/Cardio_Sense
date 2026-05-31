/* js/websocket.js — WebSocket Client Module */

class CardioWebSocket {
  constructor(url = 'ws://localhost:3000') {
    this.url = url;
    this.ws = null;
    this.reconnectDelay = 2000;
    this.maxReconnectDelay = 15000;
    this.currentDelay = this.reconnectDelay;
    this.callbacks = {};
    this.manualDisconnect = false;
    this.isConnected = false;
  }
  
  // Establish connection with WebSocket server
  connect() {
    this.manualDisconnect = false;
    console.log(`[WebSocket] Connecting to ${this.url}...`);
    
    try {
      this.ws = new WebSocket(this.url);
    } catch (e) {
      console.error('[WebSocket] Instantiation error:', e);
      this.handleDisconnect();
      return;
    }
    
    this.ws.onopen = () => {
      console.log('[WebSocket] Connection established successfully.');
      this.isConnected = true;
      this.currentDelay = this.reconnectDelay; // reset backoff
      this.emit('connected');
    };
    
    this.ws.onclose = () => {
      this.isConnected = false;
      this.emit('disconnected');
      if (!this.manualDisconnect) {
        this.handleDisconnect();
      }
    };
    
    this.ws.onerror = (error) => {
      console.error('[WebSocket] Error occurred:', error);
      this.emit('error', error);
    };
    
    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        // Emit specific message type event (e.g. 'sensor_stream')
        if (data.type) {
          this.emit(data.type, data);
        }
        // General packet event
        this.emit('message', data);
      } catch (e) {
        console.error('[WebSocket] Failed parsing JSON message:', e);
      }
    };
  }
  
  // Schedule reconnection loop with backoff
  handleDisconnect() {
    console.log(`[WebSocket] Reconnection scheduled in ${(this.currentDelay / 1000).toFixed(1)}s.`);
    setTimeout(() => {
      if (!this.manualDisconnect && !this.isConnected) {
        this.connect();
        // Double delay up to max delay (exponential backoff)
        this.currentDelay = Math.min(this.currentDelay * 1.5, this.maxReconnectDelay);
      }
    }, this.currentDelay);
  }
  
  // Manually terminate connection
  disconnect() {
    this.manualDisconnect = true;
    if (this.ws) {
      this.ws.close();
    }
    this.isConnected = false;
    this.emit('disconnected');
  }
  
  // Register an event listener callback
  on(event, callback) {
    this.callbacks[event] = this.callbacks[event] || [];
    this.callbacks[event].push(callback);
  }
  
  // Fire registered event callbacks
  emit(event, data) {
    if (this.callbacks[event]) {
      this.callbacks[event].forEach(cb => {
        try {
          cb(data);
        } catch (e) {
          console.error(`[WebSocket] Error in callback for event "${event}":`, e);
        }
      });
    }
  }
  
  // Broadcast a packet to the server
  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
      return true;
    }
    console.warn('[WebSocket] Cannot send. Connection is closed.');
    return false;
  }
}
