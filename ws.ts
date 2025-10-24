export class WebSocketClient {
  private socket: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;

  constructor(
    private url: string,
    private callbacks: {
      onMessageCallback?: (message: any) => void;
      onErrorCallback?: (message: any) => void;
    },
  ) {}

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log("🔌 Connecting to WebSocket server...");

      this.socket = new WebSocket(this.url);

      this.socket.onopen = (_event) => {
        console.log("✅ WebSocket connection established!");
        this.reconnectAttempts = 0;
        resolve();
      };

      this.socket.onmessage = (event) => {
        // console.log("📨 Message received:", event.data);
        const parsedMessage = JSON.parse(event.data);
        this.handleMessage(parsedMessage);
      };

      this.socket.onclose = (event) => {
        console.log("🔌 WebSocket connection closed:", event.code, event.reason);
        this.handleReconnect();
      };

      this.socket.onerror = (error) => {
        console.error("❌ WebSocket error:", error);
        if (this.callbacks.onErrorCallback != null) {
          this.callbacks.onErrorCallback(error);
        }
        reject(error);
      };
    });
  }

  private handleMessage(message: any): void {
    if (this.callbacks.onMessageCallback != null) {
      this.callbacks.onMessageCallback(message);
    }
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
