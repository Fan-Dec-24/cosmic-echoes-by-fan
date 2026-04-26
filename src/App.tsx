import { useEffect, useRef, useState } from 'react';
import { ParticleEngine } from './ParticleEngine';
import { HandState, HandTracker } from './HandTracker';

const ANSWERS = [
  "毫无疑问", 
  "钟摆左右，时间既不向前也不后退", 
  "那条路通向迷雾，没有归程", 
  "星辰的轨迹指向你的掌心", 
  "现在正是时候", 
  "也许是时候接受不确定性", 
  "再等等看", 
  "去感受", 
  "不妨勇敢一次", 
  "不必在意他人之疑目", 
  "去期待，但别执着", 
  "答案是“不”，但那是好事", 
  "你所害怕的那个结果不会发生", 
  "不是该放弃的时候"
];

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const engineRef = useRef<ParticleEngine | null>(null);
  const trackerRef = useRef<HandTracker | null>(null);

  const [isFullscreen, setIsFullscreen] = useState(false);
  
  // States: 'idle' -> 'gathering' -> 'revealing' 
  const [appState, setAppState] = useState<'idle' | 'gathering' | 'revealing'>('idle');
  const [currentAnswer, setCurrentAnswer] = useState("");
  const [isCameraActive, setIsCameraActive] = useState(false);

  const gatherStartTimeRef = useRef<number>(0);
  const revealStartTimeRef = useRef<number>(0);
  const appStateRef = useRef<'idle' | 'gathering' | 'revealing'>('idle');

  useEffect(() => {
    appStateRef.current = appState;
  }, [appState]);

  useEffect(() => {
    if (!canvasRef.current || !videoRef.current) return;

    // Initialize 3D Engine
    engineRef.current = new ParticleEngine(canvasRef.current);

    // Initialize Hand Tracking
    trackerRef.current = new HandTracker(videoRef.current);
    
    trackerRef.current.onPosition = (x: number, y: number, z: number, scale: number) => {
      if (engineRef.current) {
        // Map normalized 0-1 to Three.js world coordinates
        // Assuming camera FOV setup, roughly: x: -20 to 20, y: 15 to -15
        engineRef.current.targetX = -(x - 0.5) * 40; // Mirror X
        engineRef.current.targetY = -(y - 0.5) * 30;
        engineRef.current.targetScale = scale;
      }
    };

    trackerRef.current.onStateChange = (state: HandState) => {
      const now = Date.now();
      
      if (state === 'FIST') {
        if (appStateRef.current === 'idle') {
          // Start gathering phase
          setAppState('gathering');
          gatherStartTimeRef.current = now;
          if (engineRef.current) {
            engineRef.current.mode = 'gather';
            engineRef.current.nextGatherShape();
          }
        }
      } else if (state === 'OPEN' || state === 'IDLE') {
        if (appStateRef.current === 'idle') {
           if (engineRef.current) engineRef.current.mode = state === 'OPEN' ? 'follow' : 'nebula';
        } else if (appStateRef.current === 'gathering') {
           // Interrupted gathering
           const elapsed = now - gatherStartTimeRef.current;
           if (elapsed < 1000) {
              setAppState('idle');
              if (engineRef.current) engineRef.current.mode = state === 'OPEN' ? 'follow' : 'nebula';
           }
        } else if (appStateRef.current === 'revealing') {
           // Wait at least 2 seconds before closing answer
           const elapsed = now - revealStartTimeRef.current;
           if (elapsed >= 2000) {
             setAppState('idle');
             setCurrentAnswer("");
             if (engineRef.current) engineRef.current.mode = state === 'OPEN' ? 'follow' : 'nebula';
           } else {
             // Force wait until 2s has passed by checking again soon
             setTimeout(() => {
                if (trackerRef.current && (trackerRef.current as any).lastState !== 'FIST' && appStateRef.current === 'revealing') {
                  setAppState('idle');
                  setCurrentAnswer("");
                  if (engineRef.current) engineRef.current.mode = 'follow';
                }
             }, 2000 - elapsed);
           }
        }
      }
    };

    trackerRef.current.initialize().then(() => {
      setIsCameraActive(true);
    });

    // Loop for progressing state internally when fist is held
    const interval = setInterval(() => {
      if (appStateRef.current === 'gathering') {
         if (Date.now() - gatherStartTimeRef.current >= 1000) {
            // Trigger answer
            setAppState('revealing');
            revealStartTimeRef.current = Date.now();
            setCurrentAnswer(ANSWERS[Math.floor(Math.random() * ANSWERS.length)]);
         }
      }
    }, 100);

    return () => {
      clearInterval(interval);
      if (engineRef.current) engineRef.current.dispose();
      if (trackerRef.current) trackerRef.current.dispose();
    };
  }, []);

  const toggleFullscreen = async () => {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen().catch(() => {});
      try {
        if (screen.orientation && screen.orientation.lock) {
          await screen.orientation.lock('landscape').catch(() => {});
        }
      } catch (e) {}
      setIsFullscreen(true);
    } else {
      await document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  return (
    <div className="relative w-full h-full bg-[#020408] text-white overflow-hidden font-sans select-none">
      {/* Background Atmosphere */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-[600px] h-[600px] bg-blue-900/20 rounded-full blur-[120px]"></div>
        <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-indigo-900/10 rounded-full blur-[100px]"></div>
      </div>

      {/* Particle Canvas Layer */}
      <canvas ref={canvasRef} className="absolute inset-0 z-10 opacity-70 pointer-events-none" />
      
      {/* Hidden processing video */}
      <video 
        ref={videoRef} 
        style={{ display: 'none' }} 
        autoPlay 
        playsInline 
        muted 
      />

      {/* Header UI */}
      <header className="absolute top-12 w-full flex flex-col items-center z-20 pointer-events-none">
        <h1 className="text-xs tracking-[0.6em] font-light opacity-50 uppercase mb-2">Cosmic Echoes</h1>
        <div className="h-[1px] w-12 bg-white/20"></div>
      </header>

      {/* Main Answer Display */}
      <main className="absolute inset-0 flex items-center justify-center z-30 px-6 sm:px-24 text-center pointer-events-none">
        {appState === 'revealing' && (
          <div className="animate-fade-zoom inline-block">
            <p className="text-4xl md:text-5xl font-serif italic text-blue-50 leading-relaxed font-light tracking-wide px-4">
              {currentAnswer}
            </p>
            <div className="mt-8 flex justify-center w-full px-4">
              <div className="h-[1px] w-full max-w-sm bg-gradient-to-r from-transparent via-white/50 to-transparent"></div>
            </div>
          </div>
        )}
      </main>

      {/* Interaction Prompt */}
      <footer className="absolute bottom-8 sm:bottom-12 w-full flex flex-col items-center z-20 pointer-events-none">
        <div className="flex items-center space-x-3 mb-6 opacity-40">
          <div className="w-10 h-[1px] bg-white"></div>
          <span className="text-[10px] tracking-widest uppercase">握紧双拳，释放答案</span>
          <div className="w-10 h-[1px] bg-white"></div>
        </div>
        
        <div className="flex space-x-6 sm:space-x-8 items-center pointer-events-auto">
          <div className="text-[9px] tracking-tighter opacity-30 flex items-center">
            <span className={`w-1.5 h-1.5 rounded-full mr-2 ${isCameraActive ? 'bg-green-500' : 'bg-red-500'}`}></span>
            CAMERA ACTIVE
          </div>
          <button 
            onClick={toggleFullscreen} 
            className="px-4 py-1.5 border border-white/20 rounded-full text-[10px] tracking-widest hover:bg-white/10 transition-colors uppercase cursor-pointer"
          >
            Fullscreen
          </button>
          <div className="text-[9px] tracking-tighter opacity-30">
            SYSTEM READY
          </div>
        </div>
      </footer>
    </div>
  );
}
