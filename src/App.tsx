import { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { ParticleEngine } from './ParticleEngine';
import { HandState, HandTracker } from './HandTracker';
import bgmUrl from './assets/bgm.mp3';

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
  "去期待但别执着", 
  "答案是“不”，但那会是好事", 
  "你所害怕的那个结果不会发生", 
  "不是该放弃的时候",
  "你的勇气正在星系另一端凝结成光",
  "允许自己迷路，宇宙本来就没有路标",
  "风已经吹动了，你还没感觉到自己的翎羽",
  "你渴望的也正在奔向你",
  "所有的漫游，最后都会抵达",
  "熵增不可逆",
  "像流星切过夜空般果断，不要回头"
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

  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);

  useEffect(() => {
    // Attempt to play audio on user interaction
    const handleInteract = () => {
      setHasInteracted(true);
      if (audioRef.current && audioRef.current.paused) {
        audioRef.current.volume = 0.5;
        const playPromise = audioRef.current.play();
        if (playPromise !== undefined) {
          playPromise.then(() => {
            setIsPlaying(true);
            document.removeEventListener('click', handleInteract);
            document.removeEventListener('touchstart', handleInteract);
            document.removeEventListener('touchend', handleInteract);
          }).catch((err) => {
            console.log("Audio play failed, will retry on next interaction:", err);
          });
        }
      }
    };
    
    document.addEventListener('click', handleInteract);
    document.addEventListener('touchstart', handleInteract);
    document.addEventListener('touchend', handleInteract);

    return () => {
      document.removeEventListener('click', handleInteract);
      document.removeEventListener('touchstart', handleInteract);
      document.removeEventListener('touchend', handleInteract);
    };
  }, []);

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
        if (screen.orientation && 'unlock' in screen.orientation) {
          screen.orientation.unlock();
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

      {/* Touch to start prompt overlay */}
      {!hasInteracted && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm pointer-events-none transition-opacity duration-1000 px-4">
          <p className="text-white/80 text-xs sm:text-sm tracking-[0.3em] font-light uppercase animate-pulse text-center w-full">
            Touch to awaken the cosmos
          </p>
        </div>
      )}

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
      <header className="absolute top-10 sm:top-16 w-full flex flex-col items-center z-20 pointer-events-none">
        <h1 className="text-sm sm:text-base tracking-[0.6em] font-extralight text-cyan-50 opacity-60 uppercase mb-3 drop-shadow-lg">Cosmic Echoes</h1>
        <div className="h-[1px] w-16 bg-gradient-to-r from-transparent via-cyan-300/40 to-transparent"></div>
      </header>

      {/* Music Toggle */}
      <div className="absolute top-6 right-6 z-50">
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (audioRef.current) {
              if (isPlaying) {
                audioRef.current.pause();
                setIsPlaying(false);
              } else {
                audioRef.current.volume = 0.5;
                audioRef.current.play()
                  .then(() => setIsPlaying(true))
                  .catch(() => {});
              }
            }
          }}
          className="p-2 rounded-full border border-cyan-200/20 text-cyan-100/40 hover:bg-cyan-900/30 hover:border-cyan-400/50 hover:text-cyan-50 transition-all duration-300"
        >
          {isPlaying ? <Volume2 size={16} /> : <VolumeX size={16} />}
        </button>
      </div>

      {/* Main Answer Display */}
      <main className="absolute inset-0 flex items-center justify-center z-30 px-6 sm:px-32 pointer-events-none">
        {appState === 'revealing' && (
          <div className="animate-fade-zoom w-full max-w-3xl flex flex-col items-center mt-8">
            <div className="relative flex justify-center items-center w-full min-h-[30vh] sm:min-h-0 px-8 sm:px-16">
              {/* Subtle glowing brackets to frame the text */}
              <span className="absolute -left-2 sm:-left-16 top-0 text-cyan-500/30 text-5xl sm:text-7xl font-serif font-extralight select-none">「</span>
              
              <p 
                className="text-xl sm:text-3xl md:text-4xl font-serif text-cyan-50 font-light text-center tracking-[0.1em] sm:tracking-[0.1em] leading-[2.2] sm:leading-loose px-2 w-full break-words"
                style={{ 
                  textShadow: '0 0 20px rgba(164, 242, 255, 0.4), 0 0 10px rgba(164, 242, 255, 0.2)'
                }}
              >
                {currentAnswer}
              </p>

              <span className="absolute -right-2 sm:-right-16 bottom-0 text-cyan-500/30 text-5xl sm:text-7xl font-serif font-extralight select-none">」</span>
            </div>

            <div className="mt-8 sm:mt-16 flex justify-center w-full px-4">
              <div className="h-[1px] w-full max-w-md bg-gradient-to-r from-transparent via-cyan-200/30 to-transparent shadow-[0_0_15px_rgba(164,242,255,0.4)]"></div>
            </div>
          </div>
        )}
      </main>

      {/* Interaction Prompt */}
      <footer className="absolute bottom-6 sm:bottom-10 w-full flex flex-col items-center z-20 pointer-events-none">
        <div className="flex items-center space-x-2 sm:space-x-4 mb-6 opacity-60">
          <div className="w-8 sm:w-16 h-[1px] bg-gradient-to-r from-transparent to-cyan-200/60"></div>
          <span className="text-[9px] sm:text-[11px] tracking-[0.3em] sm:tracking-[0.4em] text-cyan-100 font-extralight">握紧双拳，释放答案</span>
          <div className="w-8 sm:w-16 h-[1px] bg-gradient-to-l from-transparent to-cyan-200/60"></div>
        </div>
        
        <div className="w-full pointer-events-auto px-4 pb-2">
          {/* Non-Mobile-Portrait Layout */}
          <div className="hidden sm:flex landscape:flex items-center justify-center gap-6 sm:gap-12">
            <div className="text-[9px] sm:text-[9px] tracking-widest text-cyan-100/30 flex items-center font-extralight uppercase w-32 justify-end">
              <span className={`w-1.5 h-1.5 rounded-full mr-2 shadow-[0_0_6px_currentColor] ${isCameraActive ? 'bg-cyan-400 text-cyan-400' : 'bg-red-500 text-red-500'}`}></span>
              CAMERA ACTIVE
            </div>
            
            <button 
              onClick={toggleFullscreen} 
              className="px-6 py-2 sm:px-5 sm:py-1.5 border border-cyan-200/20 rounded-full text-[10px] sm:text-[10px] tracking-widest text-cyan-100/40 hover:bg-cyan-900/30 hover:border-cyan-400/50 hover:text-cyan-50 transition-all duration-300 uppercase cursor-pointer whitespace-nowrap"
            >
              {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            </button>

            <div className="text-[9px] sm:text-[9px] tracking-widest text-cyan-100/30 font-extralight uppercase w-32 text-left">
              FAN
            </div>
          </div>

          {/* Mobile Portrait Layout */}
          <div className="flex sm:hidden landscape:hidden flex-col items-center gap-4">
            <button 
              onClick={toggleFullscreen} 
              className="px-6 py-2 border border-cyan-200/20 rounded-full text-[10px] tracking-widest text-cyan-100/40 hover:bg-cyan-900/30 hover:border-cyan-400/50 hover:text-cyan-50 transition-all duration-300 uppercase cursor-pointer"
            >
              {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            </button>
            <div className="flex items-center justify-center gap-8 mt-1">
              <div className="text-[9px] tracking-widest text-cyan-100/30 flex items-center font-extralight uppercase">
                <span className={`w-1.5 h-1.5 rounded-full mr-2 shadow-[0_0_6px_currentColor] ${isCameraActive ? 'bg-cyan-400 text-cyan-400' : 'bg-red-500 text-red-500'}`}></span>
                CAMERA ACTIVE
              </div>
              <div className="text-[9px] tracking-widest text-cyan-100/30 font-extralight uppercase">
                FAN
              </div>
            </div>
          </div>

          <audio ref={audioRef} src={bgmUrl} loop preload="auto" style={{ display: 'none' }} />
        </div>
      </footer>
    </div>
  );
}
