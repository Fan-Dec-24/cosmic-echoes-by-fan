export type HandState = 'IDLE' | 'FIST' | 'OPEN';

export class HandTracker {
  private hands: any = null;
  private cameraProcess: any = null;
  
  // Callbacks
  public onStateChange?: (state: HandState) => void;
  public onPosition?: (x: number, y: number, z: number, scale: number) => void;
  
  private lastState: HandState = 'IDLE';

  constructor(private videoElement: HTMLVideoElement) {}

  public async initialize() {
    // Relying on CDN imports loaded in index.html global scope: window.Hands, window.Camera
    if (!(window as any).Hands || !(window as any).Camera) {
      console.warn("MediaPipe Hands not loaded yet. Retrying in 500ms.");
      setTimeout(() => this.initialize(), 500);
      return;
    }

    this.hands = new (window as any).Hands({
      locateFile: (file: string) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
      }
    });

    this.hands.setOptions({
      maxNumHands: 1, // Only track 1 hand for simplicity 
      modelComplexity: 1,
      minDetectionConfidence: 0.6,
      minTrackingConfidence: 0.6
    });

    this.hands.onResults(this.onResults.bind(this));

    this.cameraProcess = new (window as any).Camera(this.videoElement, {
      onFrame: async () => {
        await this.hands.send({ image: this.videoElement });
      },
      width: 640,
      height: 480
    });

    this.cameraProcess.start();
  }

  private onResults(results: any) {
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      const landmarks = results.multiHandLandmarks[0];
      
      // Calculate hand midpoint (average of wrist and palm center roughly)
      const rootX = landmarks[0].x;
      const rootY = landmarks[0].y;
      
      const middleBaseX = landmarks[9].x;
      const middleBaseY = landmarks[9].y;

      const centerX = (rootX + middleBaseX) / 2;
      const centerY = (rootY + middleBaseY) / 2;
      
      const distance = (p1: any, p2: any) => {
        return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
      };
      const handSize = distance(landmarks[0], landmarks[9]);
      const normalizedScale = Math.min(Math.max(handSize * 4, 0.6), 1.8);
      
      if (this.onPosition) {
        this.onPosition(centerX, centerY, landmarks[0].z, normalizedScale);
      }

      // Check if fist
      const isFist = this.checkFist(landmarks);
      const newState: HandState = isFist ? 'FIST' : 'OPEN';
      
      if (newState !== this.lastState) {
        this.lastState = newState;
        if (this.onStateChange) {
          this.onStateChange(newState);
        }
      }
    } else {
       if (this.lastState !== 'IDLE') {
          this.lastState = 'IDLE';
          if (this.onStateChange) this.onStateChange('IDLE');
       }
    }
  }

  private checkFist(landmarks: any[]): boolean {
    const distance = (p1: any, p2: any) => {
      return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2) + Math.pow(p1.z - p2.z, 2));
    };

    const wrist = landmarks[0];
    
    // Check index, middle, ring, pinky. If fingertips are closer to wrist than their respective MCPs, they are curled.
    const isFingerCurled = (mcpIdx: number, tipIdx: number) => {
       const mcpDist = distance(landmarks[mcpIdx], wrist);
       const tipDist = distance(landmarks[tipIdx], wrist);
       // Heuristic: If tip is significantly closer to wrist than mcp, curled.
       return tipDist < mcpDist * 0.9; 
    };

    const isFist = 
       isFingerCurled(5, 8) &&   // Index
       isFingerCurled(9, 12) &&  // Middle
       isFingerCurled(13, 16) && // Ring
       isFingerCurled(17, 20);   // Pinky
       
    return isFist;
  }

  public dispose() {
    if (this.cameraProcess) {
      this.cameraProcess.stop();
    }
    if (this.hands) {
      this.hands.close();
    }
  }
}
