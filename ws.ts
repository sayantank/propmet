// 🌟 Basic WebSocket connection
// client.ts - Browser WebSocket client
export class WebSocketClient {
  private socket: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;

  constructor(private url: string) {}

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log("🔌 Connecting to WebSocket server...");

      this.socket = new WebSocket(this.url);

      this.socket.onopen = (event) => {
        console.log("✅ WebSocket connection established!");
        this.reconnectAttempts = 0;
        resolve();
      };

      this.socket.onmessage = (event) => {
        console.log("📨 Message received:", event.data);
        this.handleMessage(JSON.parse(event.data));
      };

      this.socket.onclose = (event) => {
        console.log("🔌 WebSocket connection closed:", event.code, event.reason);
        this.handleReconnect();
      };

      this.socket.onerror = (error) => {
        console.error("❌ WebSocket error:", error);
        reject(error);
      };
    });
  }

  send(message: any): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    } else {
      console.warn("⚠️ WebSocket not connected. Message not sent:", message);
    }
  }

  private handleMessage(message: any): void {
    // Override in subclasses or provide callback
    console.log("📥 Handling message:", message);
  }

  private handleReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(
        `🔄 Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`,
      );

      setTimeout(() => {
        this.connect().catch(console.error);
      }, this.reconnectDelay * this.reconnectAttempts);
    } else {
      console.error("💥 Max reconnection attempts reached");
    }
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }
}
