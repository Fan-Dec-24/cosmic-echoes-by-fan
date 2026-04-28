import * as THREE from 'three';

export class ParticleEngine {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private geometry: THREE.BufferGeometry;
  private material: THREE.PointsMaterial;
  private points: THREE.Points;
  private animationFrameId: number = 0;
  
  private count = 4500;
  
  private positions: Float32Array;
  private basePositions: Float32Array;
  private velocities: Float32Array;
  private randoms: Float32Array;
  private colors: Float32Array;
  
  public targetX: number = 0;
  public targetY: number = 0;
  public targetScale: number = 1;
  private currentScale: number = 1;
  
  private _mode: 'nebula' | 'follow' | 'gather' | 'answer' = 'nebula';
  private modeStartTime: number = 0;
  
  public get mode() { return this._mode; }
  public set mode(value: 'nebula' | 'follow' | 'gather' | 'answer') {
    if (this._mode !== value) {
      this._mode = value;
      this.modeStartTime = this.time;
    }
  }
  
  public gatherShape: 'sphere' | 'heart' | 'dna' | 'lemniscate' | 'rose' | 'snowflake' | 'vortex' = 'sphere';
  private shapeCycle: Array<'sphere' | 'heart' | 'dna' | 'lemniscate' | 'rose' | 'snowflake' | 'vortex'> = ['sphere', 'heart', 'dna', 'lemniscate', 'rose', 'snowflake', 'vortex'];
  private currentShapeIndex = 0;

  private time = 0;

  // Starfield
  private starfieldObj: THREE.Points;

  // Meteors
  private meteorsObj: THREE.Points;
  private meteorPositions: Float32Array;
  private meteorVelocities: Float32Array;
  private meteorRandoms: Float32Array;
  private meteorCount = 5;

  constructor(canvas: HTMLCanvasElement) {
    this.scene = new THREE.Scene();
    
    // Add some soft ambient fog to enhance depth
    this.scene.fog = new THREE.FogExp2(0x05050A, 0.02);

    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.z = 30;

    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.positions = new Float32Array(this.count * 3);
    this.basePositions = new Float32Array(this.count * 3);
    this.velocities = new Float32Array(this.count * 3);
    this.randoms = new Float32Array(this.count);
    this.colors = new Float32Array(this.count * 3);

    // Initial cosmic nebula shape (galaxy spiral)
    for (let i = 0; i < this.count; i++) {
        const i3 = i * 3;
        
        const radius = Math.random() * 25 + 2;
        const spinAngle = radius * 0.5;
        const branchAngle = ((i % 3) * Math.PI * 2) / 3;
        const randomX = Math.pow(Math.random(), 3) * (Math.random() < 0.5 ? 1 : -1) * 8 * (30/radius);
        const randomY = Math.pow(Math.random(), 3) * (Math.random() < 0.5 ? 1 : -1) * 8 * (30/radius);
        const randomZ = Math.pow(Math.random(), 3) * (Math.random() < 0.5 ? 1 : -1) * 8 * (30/radius);

        const x = Math.cos(branchAngle + spinAngle) * radius + randomX;
        const y = randomY;  // flattening it slightly
        const z = Math.sin(branchAngle + spinAngle) * radius + randomZ;

        this.basePositions[i3] = x;
        this.basePositions[i3 + 1] = y;
        this.basePositions[i3 + 2] = z;

        this.positions[i3] = x;
        this.positions[i3 + 1] = y;
        this.positions[i3 + 2] = z;

        this.velocities[i3] = 0;
        this.velocities[i3 + 1] = 0;
        this.velocities[i3 + 2] = 0;
        
        this.randoms[i] = Math.random();
    }

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.geometry.setAttribute('aRandom', new THREE.BufferAttribute(this.randoms, 1));
    // velocities and basePositions are used in logic, not directly sent to GPU to save bandwidth

    // Create a circular gradient texture for soft particles
    const textCanvas = document.createElement('canvas');
    textCanvas.width = 32;
    textCanvas.height = 32;
    const ctx = textCanvas.getContext('2d')!;
    const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.1, 'rgba(200,230,255,0.7)');
    gradient.addColorStop(0.3, 'rgba(100,180,255,0.1)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 32, 32);
    const texture = new THREE.CanvasTexture(textCanvas);

    this.material = new THREE.PointsMaterial({
      size: 1.6,
      map: texture,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
      opacity: 0.9,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    // Tilted galaxy view
    this.points.rotation.x = 0.2;
    this.scene.add(this.points);

    // Meteor setup
    this.meteorPositions = new Float32Array(this.meteorCount * 3);
    this.meteorVelocities = new Float32Array(this.meteorCount * 3);
    this.meteorRandoms = new Float32Array(this.meteorCount);

    for (let i = 0; i < this.meteorCount; i++) {
        this.meteorPositions[i*3] = -100; // start offscreen
        this.meteorRandoms[i] = Math.random();
    }
    const meteorGeo = new THREE.BufferGeometry();
    meteorGeo.setAttribute('position', new THREE.BufferAttribute(this.meteorPositions, 3));
    
    const meteorMat = new THREE.PointsMaterial({
        size: 2.5,
        map: texture,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        color: 0xffffee,
        opacity: 0.9,
    });
    this.meteorsObj = new THREE.Points(meteorGeo, meteorMat);
    this.scene.add(this.meteorsObj);

    // Background Starfield Setup
    const starCount = 2000;
    const starGeo = new THREE.BufferGeometry();
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
        // Distribute stars in a large distant sphere
        const r = 100 + Math.random() * 300;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        starPos[i*3] = r * Math.sin(phi) * Math.cos(theta);
        starPos[i*3+1] = r * Math.sin(phi) * Math.sin(theta);
        starPos[i*3+2] = r * Math.cos(phi) - 80; // Push backwards
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    
    // Create a circular texture for stars
    const starCanvas = document.createElement('canvas');
    starCanvas.width = 16;
    starCanvas.height = 16;
    const starCtx = starCanvas.getContext('2d')!;
    const starGradient = starCtx.createRadialGradient(8, 8, 0, 8, 8, 8);
    starGradient.addColorStop(0, 'rgba(255,255,255,1)');
    starGradient.addColorStop(0.3, 'rgba(200,230,255,0.8)');
    starGradient.addColorStop(1, 'rgba(0,0,0,0)');
    starCtx.fillStyle = starGradient;
    starCtx.fillRect(0, 0, 16, 16);
    const starTexture = new THREE.CanvasTexture(starCanvas);

    const starMat = new THREE.PointsMaterial({
        size: 2.5,
        map: starTexture,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        color: 0xddedff, // Slight pale blue
    });
    this.starfieldObj = new THREE.Points(starGeo, starMat);
    this.scene.add(this.starfieldObj);

    window.addEventListener('resize', this.onWindowResize.bind(this));
    this.animate();
  }

  public nextGatherShape() {
    this.currentShapeIndex = (this.currentShapeIndex + 1) % this.shapeCycle.length;
    this.gatherShape = this.shapeCycle[this.currentShapeIndex];
  }

  private onWindowResize = () => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  private animate = () => {
    this.animationFrameId = requestAnimationFrame(this.animate);
    this.time += 0.01;

    // Smoothly interpolate scale
    this.currentScale += (this.targetScale - this.currentScale) * 0.1;
    this.points.scale.set(this.currentScale, this.currentScale, this.currentScale);

    // Update meteors
    const meteorPosAttr = this.meteorsObj.geometry.attributes.position;
    const meteorPos = meteorPosAttr.array as Float32Array;
    for (let m = 0; m < this.meteorCount; m++) {
        const m3 = m * 3;
        if (meteorPos[m3] > 60 || meteorPos[m3+1] < -50 || meteorPos[m3] < -60) {
            if (Math.random() < 0.005) { // Spawn chance
                meteorPos[m3] = -40 - Math.random() * 20; 
                meteorPos[m3+1] = 20 + Math.random() * 20; 
                meteorPos[m3+2] = (Math.random() - 0.5) * 20 - 10; 
                
                this.meteorVelocities[m3] = 0.5 + Math.random() * 1.5;
                this.meteorVelocities[m3+1] = -0.5 - Math.random() * 1.0;
                this.meteorVelocities[m3+2] = 0;
            }
        } else {
            meteorPos[m3] += this.meteorVelocities[m3];
            meteorPos[m3+1] += this.meteorVelocities[m3+1];
            meteorPos[m3+2] += this.meteorVelocities[m3+2];
        }
    }
    meteorPosAttr.needsUpdate = true;

    // Slowly rotate the background starfield for cosmic depth effect
    this.starfieldObj.rotation.y += 0.0003;
    this.starfieldObj.rotation.x += 0.0001;

    // Normalize Y rotation to -PI to PI for smooth interpolation
    let currentY = this.points.rotation.y;
    currentY = Math.atan2(Math.sin(currentY), Math.cos(currentY));
    this.points.rotation.y = currentY;

    // Smoothly adjust global rotation based on mode
    if (this.mode === 'nebula' || this.mode === 'follow') {
      this.points.rotation.y += 0.002;
      this.points.rotation.x += (0.3 - this.points.rotation.x) * 0.02; // Tilted galaxy
    } else {
      // Frontal presentation first, then rotate with hand gestures
      const modeDuration = this.time - this.modeStartTime;
      const influence = Math.min(1, Math.max(0, (modeDuration - 0.5) * 2.0)); // Wait for initial presentation
      
      const targetRotY = (this.targetX * 0.03) * influence;
      const targetRotX = (-this.targetY * 0.03) * influence;

      let diffY = targetRotY - this.points.rotation.y;
      diffY = Math.atan2(Math.sin(diffY), Math.cos(diffY));
      this.points.rotation.y += diffY * 0.05;

      let diffX = targetRotX - this.points.rotation.x;
      diffX = Math.atan2(Math.sin(diffX), Math.cos(diffX));
      this.points.rotation.x += diffX * 0.05;
    }

    const posAttr = this.geometry.attributes.position;
    const posArr = posAttr.array as Float32Array;
    const colorAttr = this.geometry.attributes.color;
    const colorArr = colorAttr.array as Float32Array;
    const tempColor = new THREE.Color();

    for (let i = 0; i < this.count; i++) {
      const i3 = i * 3;
      
      const px = posArr[i3];
      const py = posArr[i3 + 1];
      const pz = posArr[i3 + 2];

      const bx = this.basePositions[i3];
      const by = this.basePositions[i3 + 1];
      const bz = this.basePositions[i3 + 2];
      
      const rand = this.randoms[i];

      let targetX = bx;
      let targetY = by;
      let targetZ = bz;

      // Physics tuning
      let spring = 0.02;     // How strongly it pulls to target
      let friction = 0.85;   // Velocity damping
      
      if (this.mode === 'nebula') {
         // Sway softly
         targetX += Math.sin(this.time + rand * 10) * 1.5;
         targetY += Math.cos(this.time + rand * 10) * 1.5;
         spring = 0.01;
         friction = 0.92;
      } 
      else if (this.mode === 'follow') {
         // Base position, but slightly deformed toward hand if close
         const dx = this.targetX - px;
         const dy = this.targetY - py;
         const dist = Math.sqrt(dx*dx + dy*dy);
         if (dist < 15) {
             const influence = 1 - (dist / 15);
             targetX += dx * influence * 0.3;
             targetY += dy * influence * 0.3;
         }
         targetX += Math.sin(this.time + rand * 10) * 1.0;
         targetY += Math.cos(this.time + rand * 10) * 1.0;
         spring = 0.02;
         friction = 0.88;
      } 
      else if (this.mode === 'gather') {
         // Gather into different galactic patterns
         let x = 0, y = 0, z = 0;
         const a = 18; // Base scale (increased)
         
         if (this.gatherShape === 'sphere') {
             // 量子星核 (Quantum Sphere Core) - 分层的能量球体与轨道
             const partType = this.randoms[(i+1)%this.count];
             const isPortrait = this.camera.aspect < 1;
             const scaleAdjust = isPortrait ? this.camera.aspect * 1.4 : 0.9;
             const R = 15 * scaleAdjust;
             
             let ox = 0, oy = 0, oz = 0;
             
             if (partType < 0.25) {
                 // 1. 高密度能量内核 (Dense Energy Core)
                 const coreR = Math.pow(rand, 0.4) * R * 0.4;
                 const theta = rand * Math.PI * 2 + this.time * 0.8;
                 const phi = Math.acos(2 * this.randoms[(i+2)%this.count] - 1);
                 ox = coreR * Math.sin(phi) * Math.cos(theta);
                 oy = coreR * Math.sin(phi) * Math.sin(theta);
                 oz = coreR * Math.cos(phi);
             } else if (partType < 0.75) {
                 // 2. 发光晶格壳层 (Energy Lattice Shell)
                 const shellR = R * 0.95 + (this.randoms[(i+3)%this.count] - 0.5) * 1.5;
                 const theta = rand * Math.PI * 2 - this.time * 0.3;
                 const phi = Math.acos(2 * this.randoms[(i+4)%this.count] - 1);
                 
                 // 增加表面起伏纹理
                 const ripple = Math.sin(phi * 10) * Math.cos(theta * 10) * 0.8;
                 const rOffset = shellR + ripple;
                 
                 ox = rOffset * Math.sin(phi) * Math.cos(theta);
                 oy = rOffset * Math.sin(phi) * Math.sin(theta);
                 oz = rOffset * Math.cos(phi);
             } else {
                 // 3. 量子轨道环 (Quantum Orbitals) - 三道交叉的星环
                 const ringIndex = Math.floor(this.randoms[(i+5)%this.count] * 3);
                 const theta = rand * Math.PI * 2 + this.time * (1 + ringIndex * 0.4);
                 const ringR = R * 1.4 + (this.randoms[(i+6)%this.count] - 0.5) * 1.5;
                 
                 const px = ringR * Math.cos(theta);
                 const py = (this.randoms[(i+7)%this.count] - 0.5) * 0.8; // 薄环
                 const pz = ringR * Math.sin(theta);
                 
                 // 三个倾角各异的轨道
                 const tiltX = (ringIndex + 1) * Math.PI / 3;
                 const tiltZ = ringIndex * Math.PI / 4;
                 
                 const tx = px * Math.cos(tiltZ) - py * Math.sin(tiltZ);
                 const ty = px * Math.sin(tiltZ) + py * Math.cos(tiltZ);
                 
                 ox = tx;
                 oy = ty * Math.cos(tiltX) - pz * Math.sin(tiltX);
                 oz = ty * Math.sin(tiltX) + pz * Math.cos(tiltX);
             }
             
             // 呼吸脉动
             const pulse = 1 + Math.sin(this.time * 2.5 + ox * 0.1) * 0.03;
             x = ox * pulse;
             y = oy * pulse;
             z = oz * pulse;
         } else if (this.gatherShape === 'heart') {
             // 高级宇宙星云心 (Ethereal Cosmic Heart Nebula) - 具有能量带、核心星云与外围行星环的三重结构
             const t = rand * Math.PI * 2;
             const partType = this.randoms[(i+1)%this.count];
             let ox = 0, oy = 0, oz = 0;
             
             // 基础心形轮廓 (稍微上移以平衡视觉重心)
             const hx = 16 * Math.pow(Math.sin(t), 3);
             const hy = 13 * Math.cos(t) - 5 * Math.cos(2*t) - 2 * Math.cos(3*t) - Math.cos(4*t) + 2.0;
             
             if (partType < 0.35) {
                 // 1. 能量带 (Energy Ribbons): 3条发光弦沿心形轨道螺旋缠绕
                 const strand = Math.floor(this.randoms[(i+2)%this.count] * 3);
                 const phase = strand * (Math.PI * 2 / 3); 
                 const fuzz = (this.randoms[(i+3)%this.count] - 0.5) * 1.2;
                 
                 // 沿切线方向的管状膨胀与波浪
                 const tubeRadius = 1.8;
                 const wrapOsc = t * 6 - this.time * 2.5 + phase;
                 const expand = Math.sin(wrapOsc) * tubeRadius;
                 
                 // 朝外法线方向微幅波浪
                 const angle = Math.atan2(hy, hx);
                 ox = hx + Math.cos(angle) * expand + fuzz; 
                 oy = hy + Math.sin(angle) * expand + fuzz;
                 oz = Math.cos(wrapOsc) * tubeRadius + (this.randoms[(i+4)%this.count] - 0.5) * 0.8;
                 
             } else if (partType < 0.70) {
                 // 2. 星云核心 (Nebula Dust Core): 内敛的三维朦胧星体
                 const fill = Math.pow(this.randoms[(i+2)%this.count], 0.6); // 倾向外壳分布
                 const fuzzX = (this.randoms[(i+3)%this.count] - 0.5) * 5 * (1 - fill); // 内部粒子更散乱
                 const fuzzY = (this.randoms[(i+4)%this.count] - 0.5) * 5 * (1 - fill);
                 
                 ox = hx * fill + fuzzX;
                 oy = hy * fill + fuzzY;
                 // 塑造饱满的立体内核，中间厚，边缘薄
                 oz = (this.randoms[(i+5)%this.count] - 0.5) * 14 * Math.sqrt(1 - fill);
             } else {
                 // 3. 行星际光环 (Planetary Ring): 穿透心脏的宏大冷感星环结构
                 const ringTheta = rand * Math.PI * 2 + this.time * 0.15;
                 const ringR = 18 + Math.pow(this.randoms[(i+2)%this.count], 2.5) * 8; // 宽度梯度
                 
                 const tiltX = Math.PI / 3.5; // X轴倾斜
                 const tiltZ = -Math.PI / 10; // Z轴倾斜
                 
                 const px = ringR * Math.cos(ringTheta);
                 const py = (this.randoms[(i+3)%this.count] - 0.5) * 0.4; // 极致薄的一层
                 const pz = ringR * Math.sin(ringTheta);
                 
                 // 应用3D旋转矩阵
                 const tx = px * Math.cos(tiltZ) - py * Math.sin(tiltZ);
                 const ty = px * Math.sin(tiltZ) + py * Math.cos(tiltZ);
                 
                 ox = tx;
                 oy = ty * Math.cos(tiltX) - pz * Math.sin(tiltX) + 2.0; 
                 oz = ty * Math.sin(tiltX) + pz * Math.cos(tiltX);
             }
             
             // 赋予整体轻微的宇宙呼吸感并适配屏幕尺寸缩放
             const pulse = 1 + Math.sin(this.time * 2.0) * 0.02;
             const isPortrait = this.camera.aspect < 1;
             const scaleAdjust = isPortrait ? this.camera.aspect * 1.5 : 0.95;
             const finalScale = scaleAdjust * pulse;
             
             x = ox * finalScale;
             y = oy * finalScale;
             z = oz * finalScale;
         } else if (this.gatherShape === 'dna') {
             // 宇宙基因数据流 (Cosmic Genetic Data Stream)
             const numTurns = 3.5; 
             const radius = 6.5; 
             const heightScale = 3.5; 
             const tSpan = Math.PI * 2 * numTurns;
             const twist = this.time * 1.0; 
             
             const partType = this.randoms[(i+2)%this.count];
             let ox = 0, oy = 0, oz = 0;
             
             if (partType < 0.5) {
                 // 1. 主干双螺旋 (Main Glowing Backbones) - 双股粗壮发光带
                 const t = (rand - 0.5) * tSpan;
                 const strandOffset = (partType < 0.25) ? 0 : Math.PI;
                 
                 // 螺旋管本身的微小盘绕
                 const localTwist = t * 10 - this.time * 3;
                 const localR = 1.2;
                 const nx = Math.cos(localTwist) * localR + (this.randoms[(i+3)%this.count] - 0.5) * 1.5;
                 const ny = (this.randoms[(i+4)%this.count] - 0.5) * 1.5;
                 const nz = Math.sin(localTwist) * localR + (this.randoms[(i+5)%this.count] - 0.5) * 1.5;
                 
                 ox = radius * Math.cos(t + strandOffset + twist) + nx;
                 oy = t * heightScale + ny;
                 oz = radius * Math.sin(t + strandOffset + twist) + nz;
             } else if (partType < 0.8) {
                 // 2. 碱基对数据桥 (Data Base Pairs) - 离散的梯级连接
                 const numRungs = Math.floor(numTurns * 12); 
                 const rungIndex = Math.floor(this.randoms[(i+6)%this.count] * numRungs);
                 const tRung = (rungIndex / numRungs - 0.5) * tSpan;
                 
                 const x1 = radius * Math.cos(tRung + twist);
                 const z1 = radius * Math.sin(tRung + twist);
                 const x2 = radius * Math.cos(tRung + Math.PI + twist);
                 const z2 = radius * Math.sin(tRung + Math.PI + twist);
                 
                 // 桥身上的能量光斑
                 const lerp = Math.pow(this.randoms[(i+7)%this.count], 0.7); 
                 const fuzzX = (this.randoms[(i+8)%this.count] - 0.5) * 1.0;
                 const fuzzY = (this.randoms[(i+9)%this.count] - 0.5) * 1.0;
                 const fuzzZ = (this.randoms[(i+10)%this.count] - 0.5) * 1.0;
                 
                 ox = x1 + (x2 - x1) * lerp + fuzzX;
                 oy = tRung * heightScale + fuzzY;
                 oz = z1 + (z2 - z1) * lerp + fuzzZ;
             } else {
                 // 3. 游离的mRNA星团 (Floating Nucleotide Dust) - 围绕螺旋自由飞舞
                 const t = (rand - 0.5) * tSpan;
                 const floatRadius = radius + 3 + this.randoms[(i+3)%this.count] * 5; 
                 const floatAngle = rand * Math.PI * 2 + this.time * 2;
                 
                 ox = floatRadius * Math.cos(floatAngle);
                 oy = t * heightScale + (this.randoms[(i+4)%this.count] - 0.5) * 8;
                 oz = floatRadius * Math.sin(floatAngle);
             }
             
             // 缩放适配与横竖屏处理
             const isPortrait = this.camera.aspect < 1;
             const scaleAdjust = isPortrait ? this.camera.aspect * 1.3 : 0.85;
             ox *= scaleAdjust; oy *= scaleAdjust; oz *= scaleAdjust;
             
             if (this.camera.aspect >= 1) {
                 x = oy; y = ox; z = oz;
             } else {
                 x = ox; y = oy; z = oz;
             }
             
         } else if (this.gatherShape === 'lemniscate') {
             // 纯粹的伯努利双扭线 (Bernoulli Lemniscate) - 保持简洁的二维优雅
             const t = rand * Math.PI * 2 + this.time * 0.4; 
             const isPortrait = this.camera.aspect < 1;
             const scaleAdjust = isPortrait ? this.camera.aspect * 1.1 : 0.95; 
             const sc = 20 * scaleAdjust;
             const denom = Math.pow(Math.sin(t), 2) + 1;
             
             x = (sc * Math.sqrt(2) * Math.cos(t)) / denom + (this.randoms[(i+1)%this.count] - 0.5) * 2.5;
             y = (sc * Math.sqrt(2) * Math.cos(t) * Math.sin(t)) / denom + (this.randoms[(i+2)%this.count] - 0.5) * 2.5;
             // 极微弱的Z轴离散度，保持纯净而生动
             z = Math.sin(t * 4 + this.time * 2) * 1.5 + (this.randoms[(i+3)%this.count] - 0.5) * 3;
         } else if (this.gatherShape === 'rose') {
             // 空灵宇宙莲花 (Ethereal Cosmic Lotus)
             const rotOffset = this.time * 0.15; 
             const t = rand * Math.PI * 2; 
             const isPortrait = this.camera.aspect < 1;
             const scaleAdjust = isPortrait ? this.camera.aspect * 1.4 : 0.9;
             
             const partType = this.randoms[(i+1)%this.count];
             const maxR = 18 * scaleAdjust;
             
             let ox = 0, oy = 0, oz = 0;
             
             if (partType < 0.15) {
                 // 1. 发光花心 (Glowing Pistil Core)
                 const coreR = Math.pow(this.randoms[(i+2)%this.count], 0.5) * 3 * scaleAdjust;
                 const coreAngle = rand * Math.PI * 2;
                 ox = coreR * Math.cos(coreAngle);
                 oy = coreR * Math.sin(coreAngle);
                 // 向上突起的抛物面
                 oz = (3 - coreR) * 1.5 + (this.randoms[(i+3)%this.count] - 0.5) * 2;
             } else if (partType < 0.85) {
                 // 2. 多片叠加的3D花瓣 (Layered 3D Petals)
                 // K=5 (5片主花瓣), 分内外两层
                 const k = 5;
                 const layer = this.randoms[(i+3)%this.count] > 0.5 ? 1 : 0.6; // 内外层大小配合
                 const petalTheta = t;
                 // 构造饱满的花瓣形状 (Rose curve变形)
                 const rBase = maxR * layer * Math.abs(Math.cos(k * petalTheta / 2)); 
                 
                 const r = rBase * Math.pow(this.randoms[(i+4)%this.count], 0.3) + (this.randoms[(i+5)%this.count]-0.5)*1.5;
                 
                 ox = r * Math.cos(petalTheta + rotOffset * layer);
                 oy = r * Math.sin(petalTheta + rotOffset * layer);
                 
                 // 给花瓣赋予优雅的3D曲度 (碗状开口)
                 // r越大，z越向上翘，再在边缘稍微下降
                 const bowl = Math.pow(r / maxR, 2) * 6;
                 const curl = Math.sin(r / maxR * Math.PI) * 4;
                 oz = bowl - curl + (this.randoms[(i+6)%this.count] - 0.5) * 1.5;
                 
                 // 外层花瓣稍微向下倾斜
                 if (layer === 1) oz -= 3;
                 
             } else {
                 // 3. 散落的花粉/星辰围绕着莲花 (Pollen Star Dust)
                 const dustR = maxR * 0.2 + this.randoms[(i+4)%this.count] * maxR * 1.2;
                 const dustAngle = rand * Math.PI * 2 - this.time * 0.3;
                 ox = dustR * Math.cos(dustAngle);
                 oy = dustR * Math.sin(dustAngle);
                 oz = (this.randoms[(i+5)%this.count] - 0.5) * 10 + Math.sin(dustR)*3;
             }
             
             // 赋予深呼吸脉动
             const breath = 1 + Math.sin(this.time * 1.5) * 0.03;
             x = ox * breath;
             y = oy * breath;
             z = oz * breath;
         } else if (this.gatherShape === 'snowflake') {
             // 极寒琉璃雪花 (Ethereal Glass Snowflake) - 更加通透锐利、带有悬浮冰晶的六角星芒
             const branchCount = 6;
             const branch = Math.floor(rand * branchCount);
             const baseAngle = (branch / branchCount) * Math.PI * 2 + this.time * 0.1; 
             
             const isPortrait = this.camera.aspect < 1;
             const scaleAdjust = isPortrait ? this.camera.aspect * 1.2 : 0.9;
             const maxR = 17 * scaleAdjust; 
             
             let sx = 0, sy = 0, sz = 0;
             const partType = this.randoms[(i+1)%this.count];
             
             if (partType < 0.20) {
                 // 1. 冰心透镜 (Ice Core Lens)
                 const hexDist = Math.pow(this.randoms[(i+2)%this.count], 0.7) * maxR * 0.25;
                 const hexAngle = rand * Math.PI * 2;
                 sx = hexDist * Math.cos(hexAngle);
                 sy = hexDist * Math.sin(hexAngle);
                 // 强化几何切割感
                 const nearestAngle = Math.round(hexAngle / (Math.PI/3)) * (Math.PI/3);
                 // 70% 倾向于边缘，形成中空透亮感
                 sx = sx * 0.3 + hexDist * Math.cos(nearestAngle) * 0.7;
                 sy = sy * 0.3 + hexDist * Math.sin(nearestAngle) * 0.7;
                 sz = (this.randoms[(i+3)%this.count] - 0.5) * 3 * Math.sqrt(1 - hexDist/(maxR*0.25)); 
             } else if (partType < 0.45) {
                 // 2. 切面主枝干 (Faceted Main Spikes)
                 const dist = Math.pow(this.randoms[(i+2)%this.count], 1.5); // 更向外抛
                 sx = dist * maxR;
                 // 让主枝干有厚薄渐变，中心厚末端尖
                 const thickness = (1 - dist) * 0.6;
                 sy = (this.randoms[(i+3)%this.count] - 0.5) * thickness;
                 sz = (this.randoms[(i+4)%this.count] - 0.5) * thickness * 2;
             } else if (partType < 0.85) {
                 // 3. 多级分形侧枝 (V-shaped sub-branches)
                 // 生成3个明确的生长节点，并分配更丰富的粒子到内侧枝干
                 const nodes = [0.3, 0.55, 0.8]; 
                 const nodeIndex = Math.floor(Math.pow(this.randoms[(i+2)%this.count], 1.2) * nodes.length);
                 const nodeRatio = nodes[nodeIndex];
                 const nodePos = nodeRatio * maxR;
                 
                 // 侧枝长度
                 const maxSubLen = (1.05 - nodeRatio) * maxR * 0.5;
                 const subDist = this.randoms[(i+3)%this.count] * maxSubLen;
                 
                 // 60度完美冰晶生长角
                 const subDir = this.randoms[(i+4)%this.count] > 0.5 ? 1 : -1;
                 const subAngle = (Math.PI / 3) * subDir;
                 
                 sx = nodePos + subDist * Math.cos(subAngle);
                 sy = subDist * Math.sin(subAngle);
                 
                 // 二级微小枝干 (Secondary tiny twigs)
                 if (this.randoms[(i+5)%this.count] < 0.25) {
                     const microDist = this.randoms[(i+6)%this.count] * maxSubLen * 0.35;
                     const microDir = this.randoms[(i+7)%this.count] > 0.5 ? 1 : -1;
                     const microAngle = subAngle + (Math.PI / 3) * microDir;
                     sx += microDist * Math.cos(microAngle);
                     sy += microDist * Math.sin(microAngle);
                 }
                 
                 // 收紧粒子离散度
                 sx += (this.randoms[(i+8)%this.count] - 0.5) * 0.3;
                 sy += (this.randoms[(i+9)%this.count] - 0.5) * 0.3;
                 sz = (this.randoms[(i+10)%this.count] - 0.5) * 1.5;
             } else {
                 // 4. 游离的寒霜晶粉 (Floating Frost Dust)
                 const dustR = maxR * 0.3 + this.randoms[(i+3)%this.count] * maxR * 1.0;
                 const dustAngle = rand * Math.PI * 2;
                 sx = dustR * Math.cos(dustAngle);
                 sy = dustR * Math.sin(dustAngle);
                 sz = (this.randoms[(i+4)%this.count] - 0.5) * 8 + Math.sin(dustR - this.time*2) * 2;
                 // 抵消 baseAngle 的旋转，使其具有独立的环绕感
                 const inverseAngle = -baseAngle + this.time * 0.2;
                 const tsx = sx * Math.cos(inverseAngle) - sy * Math.sin(inverseAngle);
                 const tsy = sx * Math.sin(inverseAngle) + sy * Math.cos(inverseAngle);
                 sx = tsx;
                 sy = tsy;
             }
             
             // 冰晶闪烁起伏
             const zRipple = Math.sin(sx * 1.5 - this.time * 2.5) * 0.5;
             sz += zRipple;
             
             // 应用分支旋转矩阵
             x = sx * Math.cos(baseAngle) - sy * Math.sin(baseAngle);
             y = sx * Math.sin(baseAngle) + sy * Math.cos(baseAngle);
             z = sz;
         } else if (this.gatherShape === 'vortex') {
             // 宇宙深渊漩涡 (Cosmic Abyss Vortex) - 面朝屏幕的宏大吸入感
             const isPortrait = this.camera.aspect < 1;
             const scaleAdjust = isPortrait ? this.camera.aspect * 1.5 : 1.15;
             const maxR = 35 * scaleAdjust; // 扩大整体范围
             
             const partType = this.randoms[(i+1)%this.count];
             let ox = 0, oy = 0, oz = 0;
             
             if (partType < 0.15) {
                 // 1. 引力黑洞核心与事件视界 (Singularity Core & Event Horizon)
                 // 让核心稍微有一个明显的"空洞"，然后边缘极亮
                 const diskR = maxR * 0.02 + Math.pow(this.randoms[(i+2)%this.count], 0.4) * maxR * 0.1;
                 const diskTheta = rand * Math.PI * 2 + this.time * 4.0; // 核心极速旋转
                 
                 ox = diskR * Math.cos(diskTheta);
                 oy = diskR * Math.sin(diskTheta);
                 // 核心极深，拉出强烈的漏斗感
                 oz = -45 + (this.randoms[(i+3)%this.count] - 0.5) * 8; 
                 
             } else {
                 // 2. 宏大旋臂与星际尘埃 (Grandiose Spiral Arms)
                 const armCount = 6; // 增加旋臂数量让漩涡更密集
                 const armIndex = Math.floor(rand * armCount);
                 const armOffset = (armIndex / armCount) * Math.PI * 2;
                 
                 // t表示离中心的距离步长 [0, 1]，集中更多粒子在内侧
                 const t = Math.pow(this.randoms[(i+2)%this.count], 1.6); 
                 const r = maxR * 0.08 + t * maxR * 0.92; 
                 
                 // 漩涡缠绕公式 (缠绕非常深，强烈的螺旋感)
                 const curl = (1.0 - Math.pow(t, 0.3)) * Math.PI * 10;
                 // 差速旋转：中心风暴般极速，边缘缓慢，极大地强化被吸入的错觉
                 const rotSpeed = 0.5 + (1 - t) * 3.5;
                 const theta = curl + armOffset - this.time * rotSpeed;
                 
                 ox = r * Math.cos(theta);
                 oy = r * Math.sin(theta);
                 
                 // 漏斗型深度 (Funnel Depth) - 陡峭的吸入视角
                 const depth = -40 + Math.pow(t, 0.6) * 60; // 从 -40 陡升 到 ~20
                 
                 // 旋臂分散度：内侧凝聚，外侧飘散
                 const scatter = t * maxR * 0.4;
                 
                 if (partType < 0.45) {
                     // 高密度主干 (Dense Arm Core) - 贴紧旋臂
                     ox += (this.randoms[(i+3)%this.count] - 0.5) * scatter * 0.1;
                     oy += (this.randoms[(i+4)%this.count] - 0.5) * scatter * 0.1;
                     oz = depth + (this.randoms[(i+5)%this.count] - 0.5) * 4;
                 } else {
                     // 松散星际尘埃与气体 (Loose Gas & Dust) - 扩散形成云雾感
                     ox += (this.randoms[(i+3)%this.count] - 0.5) * scatter;
                     oy += (this.randoms[(i+4)%this.count] - 0.5) * scatter;
                     oz = depth + (this.randoms[(i+5)%this.count] - 0.5) * scatter * 1.2 + Math.sin(t * Math.PI * 6) * 4;
                 }
             }
             
             // 仅保留微小的倾斜，维持"正对屏幕"
             const tiltX = Math.PI / 16; 
             const tiltY = -Math.PI / 24;
             
             // Y轴旋转
             let tx = ox * Math.cos(tiltY) - oz * Math.sin(tiltY);
             let tz = ox * Math.sin(tiltY) + oz * Math.cos(tiltY);
             let ty = oy;
             
             // X轴倾斜
             const fx = tx;
             const fy = ty * Math.cos(tiltX) - tz * Math.sin(tiltX);
             const fz = ty * Math.sin(tiltX) + tz * Math.cos(tiltX);
             
             // 强烈的呼吸震荡与吸入吞噬效应 (脉动)
             const pulse = 1 + Math.sin(this.time * 2.5 - Math.sqrt(fx*fx+fy*fy) * 0.1) * 0.05;
             x = fx * pulse;
             y = fy * pulse;
             z = fz * pulse;
         }
         
         // Apply a very subtle sway instead of rapid spinning for frontal shapes
         const sway = Math.sin(this.time * 0.5) * 0.15;
         const cr = Math.cos(sway);
         const sr = Math.sin(sway);
         const xRot = x * cr - z * sr;
         const zRot = x * sr + z * cr;
         
         targetX = this.targetX + xRot;
         targetY = this.targetY + y;
         targetZ = zRot;
         
         // 粒子分散度大一些，较小的spring和较大的随机
         spring = 0.015 + rand * 0.02;
         friction = 0.92;
      }
      else if (this.mode === 'answer') {
         // Form an orbital ring around the center reading area.
         // Let targetX/Y be mostly center, but forming a shell/ring.
         const r = 8 + rand * 6; // Hollow center for text
         const theta = rand * Math.PI * 2 + this.time * 0.5;
         const phi = Math.acos(2 * (rand - 0.5)); // Cylinder/sphere hybrid
         
         targetX = r * Math.sin(phi) * Math.cos(theta);
         targetY = r * Math.sin(phi) * Math.sin(theta);
         targetZ = r * Math.cos(phi) * 0.5; // flatten z slightly
         
         spring = 0.03;
         friction = 0.90;
      }

      // Calculate acceleration
      const ax = (targetX - px) * spring;
      const ay = (targetY - py) * spring;
      const az = (targetZ - pz) * spring;

      // Update velocities
      this.velocities[i3]     += ax;
      this.velocities[i3 + 1] += ay;
      this.velocities[i3 + 2] += az;

      // Apply friction
      this.velocities[i3]     *= friction;
      this.velocities[i3 + 1] *= friction;
      this.velocities[i3 + 2] *= friction;

      // Update positions
      posArr[i3]     += this.velocities[i3];
      posArr[i3 + 1] += this.velocities[i3 + 1];
      posArr[i3 + 2] += this.velocities[i3 + 2];

      // Dynamic Cosmic Colors (Cyan/Teal/Blue-green Palette)
      const distFromCenter = Math.sqrt(posArr[i3]*posArr[i3] + posArr[i3+1]*posArr[i3+1] + posArr[i3+2]*posArr[i3+2]);
      
      let hue: number;
      // Saturation generally high to make the cyan/teal pop, but varied for depth
      let saturation = 0.5 + rand * 0.4; 
      let lightness = 0.35 + Math.pow(Math.max(0, 1 - distFromCenter / 45), 2.5) * 0.45;

      if (this.mode === 'gather') {
          if (this.gatherShape === 'vortex') {
              // Deep abyss: Teal to bright Cyan (0.48 - 0.55)
              hue = 0.48 + rand * 0.07;
              saturation = 0.6 + rand * 0.3;
              lightness = 0.2 + Math.pow(Math.max(0, 1 - distFromCenter / 50), 4) * 0.8; 
          } else if (this.gatherShape === 'rose') {
              // Ethereal glowing azure & cyan (0.5 - 0.58)
              hue = 0.52 + (distFromCenter * 0.005) + rand * 0.06;
          } else if (this.gatherShape === 'heart') {
              // Deep marine teal to aquamarine (0.45 - 0.52)
              hue = 0.45 + rand * 0.07;
              saturation = 0.7 + rand * 0.2;
          } else if (this.gatherShape === 'snowflake') {
              // Ghostly icy cyan with white core (0.5 - 0.55)
              hue = 0.52 + rand * 0.03;
              saturation = 0.3 + rand * 0.2;
              lightness = 0.6 + Math.pow(Math.max(0, 1 - distFromCenter / 30), 2) * 0.4;
          } else if (this.gatherShape === 'dna') {
              // Bright bioluminescent cyan/emerald (0.45 - 0.52)
              hue = 0.48 + rand * 0.04;
              saturation = 0.65 + rand * 0.25;
          } else if (this.gatherShape === 'sphere') {
              // Astral cyan and deep sea blue mix (0.5 - 0.6)
              hue = (rand > 0.5) ? 0.52 : 0.58;
              saturation = 0.5 + rand * 0.3;
          } else if (this.gatherShape === 'lemniscate') {
              // Deep twilight teal (0.48 - 0.56)
              hue = 0.50 + rand * 0.06;
              saturation = 0.55 + rand * 0.3;
          } else {
              hue = 0.5 + rand * 0.05;
          }
      } else {
          // Nebula or Follow mode: Deep mysterious dark cyan ocean
          hue = 0.50 + rand * 0.08; 
          saturation = 0.6 + rand * 0.3; 
          lightness = 0.25 + Math.pow(Math.max(0, 1 - distFromCenter / 45), 2) * 0.4 + (Math.sin(this.time * 1.5 + rand * 10) * 0.1);
      }

      tempColor.setHSL((hue % 1.0 + 1.0) % 1.0, saturation, Math.min(1.0, lightness));
      colorArr[i3] = tempColor.r;
      colorArr[i3 + 1] = tempColor.g;
      colorArr[i3 + 2] = tempColor.b;
    }

    posAttr.needsUpdate = true;
    colorAttr.needsUpdate = true;
    this.renderer.render(this.scene, this.camera);
  }

  public dispose() {
    window.removeEventListener('resize', this.onWindowResize);
    cancelAnimationFrame(this.animationFrameId);
    this.geometry.dispose();
    this.material.dispose();
    this.renderer.dispose();
  }
}
