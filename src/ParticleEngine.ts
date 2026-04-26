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
  
  public gatherShape: 'sphere' | 'heart' | 'dna' | 'lemniscate' | 'rose' | 'snowflake' = 'sphere';
  private shapeCycle: Array<'sphere' | 'heart' | 'dna' | 'lemniscate' | 'rose' | 'snowflake'> = ['sphere', 'heart', 'dna', 'lemniscate', 'rose', 'snowflake'];
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
      color: 0xaaccff, // Soft blue-white
      opacity: 0.8,
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
             // 球状星云
             const r = rand * 18 + (this.randoms[(i+1)%this.count] * 4);
             const theta = rand * Math.PI * 2 + this.time * (1 + rand);
             const phi = Math.acos(2 * rand - 1);
             x = r * Math.sin(phi) * Math.cos(theta);
             y = r * Math.sin(phi) * Math.sin(theta);
             z = r * Math.cos(phi);
         } else if (this.gatherShape === 'heart') {
             // 爱心星团 (Refined 3D Heart Cluster with softer, warmer volume)
             const t = rand * Math.PI * 2;
             const fill = Math.pow(this.randoms[(i+1)%this.count], 0.5) * 0.8 + 0.2; 
             const pulse = 1 + Math.sin(this.time * 2.5 - fill * 3) * 0.06; // Softer, more organic heartbeat
             
             x = 16 * Math.pow(Math.sin(t), 3) * fill * pulse * 1.1;
             y = (13 * Math.cos(t) - 5 * Math.cos(2*t) - 2 * Math.cos(3*t) - Math.cos(4*t)) * fill * pulse * 1.1;
             z = (this.randoms[(i+2)%this.count] - 0.5) * 14 * Math.pow((1 - fill), 1.5); // More rounded at the core
         } else if (this.gatherShape === 'dna') {
             // 优化后的现代 DNA 双链与碱基对结构
             const numTurns = 3; // 螺旋圈数
             const radius = 6; // 螺旋半径 (适度缩小)
             const heightScale = 3.0; // 高度缩放 (适度缩小)
             const tSpan = Math.PI * 2 * numTurns;
             const twist = this.time * 1.5; // 持续旋转运动
             
             // 随机决定粒子分布：主链 vs 碱基对 (70%主链，30%碱基对)
             const partType = this.randoms[(i+2)%this.count];
             
             let ox = 0, oy = 0, oz = 0;
             if (partType < 0.7) {
                 // 两条主干 Backbone
                 const t = (rand - 0.5) * tSpan;
                 const strandOffset = (partType < 0.35) ? 0 : Math.PI;
                 
                 // 主链上的星团发散感
                 const nx = (this.randoms[(i+3)%this.count] - 0.5) * 3;
                 const ny = (this.randoms[(i+4)%this.count] - 0.5) * 3;
                 const nz = (this.randoms[(i+5)%this.count] - 0.5) * 3;
                 
                 ox = radius * Math.cos(t + strandOffset + twist) + nx;
                 oy = t * heightScale + ny;
                 oz = radius * Math.sin(t + strandOffset + twist) + nz;
             } else {
                 // 中间的碱基对连接桥 (Base pairs)
                 const numRungs = Math.floor(numTurns * 10); // 一定的离散连接层
                 const rungIndex = Math.floor(this.randoms[(i+6)%this.count] * numRungs);
                 const tRung = (rungIndex / numRungs - 0.5) * tSpan;
                 
                 // 计算端点
                 const x1 = radius * Math.cos(tRung + twist);
                 const z1 = radius * Math.sin(tRung + twist);
                 const x2 = radius * Math.cos(tRung + Math.PI + twist);
                 const z2 = radius * Math.sin(tRung + Math.PI + twist);
                 
                 // 在两点间插值
                 const lerp = this.randoms[(i+7)%this.count];
                 const nx = (this.randoms[(i+8)%this.count] - 0.5) * 1.5;
                 const ny = (this.randoms[(i+9)%this.count] - 0.5) * 1.5;
                 const nz = (this.randoms[(i+10)%this.count] - 0.5) * 1.5;
                 
                 ox = x1 + (x2 - x1) * lerp + nx;
                 oy = tRung * heightScale + ny;
                 oz = z1 + (z2 - z1) * lerp + nz;
             }
             
             // 根据屏幕横竖屏旋转
             if (this.camera.aspect >= 1) {
                 x = oy;
                 y = ox;
                 z = oz;
             } else {
                 x = ox;
                 y = oy;
                 z = oz;
             }
         } else if (this.gatherShape === 'lemniscate') {
             // 伯努利双扭线 (保持横向，适配屏幕大小)
             const t = rand * Math.PI * 2 + this.time * 0.4; // 减慢流转速度
             const isPortrait = this.camera.aspect < 1;
             const scaleAdjust = isPortrait ? this.camera.aspect * 0.85 : 1.0; 
             const sc = 20 * scaleAdjust;
             const denom = Math.pow(Math.sin(t), 2) + 1;
             
             x = (sc * Math.sqrt(2) * Math.cos(t)) / denom + (this.randoms[(i+1)%this.count] - 0.5) * 3;
             y = (sc * Math.sqrt(2) * Math.cos(t) * Math.sin(t)) / denom + (this.randoms[(i+2)%this.count] - 0.5) * 3;
             z = (this.randoms[(i+3)%this.count] - 0.5) * 6;
         } else if (this.gatherShape === 'rose') {
             // k=18 玫瑰曲线 (更加精细优美，减弱速度)
             const rotOffset = this.time * 0.1; // 整体极慢旋转
             const theta = rand * Math.PI * 2; 
             const k = 18;
             const rBase = a * Math.cos(k * theta);
             const r = rBase + (this.randoms[(i+1)%this.count] - 0.5) * 3 * Math.abs(Math.cos(k * theta)); // noise concentrated in petal body
             
             x = r * Math.cos(theta + rotOffset);
             y = r * Math.sin(theta + rotOffset);
             z = Math.sin(k * theta) * 4 + (this.randoms[(i+2)%this.count] - 0.5) * 3; // 花瓣交织的三维感
         } else if (this.gatherShape === 'snowflake') {
             // 更加复杂精密的雪花图案 (多层晶体分形结构)
             const branchCount = 6;
             const branch = Math.floor(rand * branchCount);
             const baseAngle = (branch / branchCount) * Math.PI * 2 + this.time * 0.15; // 缓慢优雅的旋转
             
             // 动态缩放适配屏幕：竖屏下以宽(aspect)为基数缩放，整体进一步收缩以免出界
             const isPortrait = this.camera.aspect < 1;
             const scaleAdjust = isPortrait ? this.camera.aspect * 1.2 : 0.9;
             const maxR = 16 * scaleAdjust; // 控制整体雪花尺寸
             
             let sx = 0;
             let sy = 0;
             let sz = 0;
             
             const partType = this.randoms[(i+1)%this.count];
             
             if (partType < 0.25) {
                 // 1. 核心六边形冰板与星芒 (Core Hex Plate & Star)
                 const hexDist = Math.pow(this.randoms[(i+2)%this.count], 0.8) * maxR * 0.28;
                 const hexAngle = rand * Math.PI * 2;
                 sx = hexDist * Math.cos(hexAngle);
                 sy = hexDist * Math.sin(hexAngle);
                 // 向六边形边缘收拢，形成清晰结构
                 const nearestAngle = Math.round(hexAngle / (Math.PI/3)) * (Math.PI/3);
                 sx = sx * 0.4 + hexDist * Math.cos(nearestAngle) * 0.6;
                 sy = sy * 0.4 + hexDist * Math.sin(nearestAngle) * 0.6;
             } else if (partType < 0.5) {
                 // 2. 6条主枝干 (Main Spikes)
                 const dist = Math.pow(this.randoms[(i+2)%this.count], 1.2); 
                 sx = dist * maxR;
             } else {
                 // 3. 多级分形侧枝 (V-shaped sub-branches)
                 // 生成3个明确的生长节点，并分配更丰富的粒子到内侧枝干
                 const nodes = [0.35, 0.6, 0.8]; 
                 const nodeIndex = Math.floor(Math.pow(this.randoms[(i+2)%this.count], 1.5) * nodes.length);
                 const nodeRatio = nodes[nodeIndex];
                 const nodePos = nodeRatio * maxR;
                 
                 // 侧枝长度：靠近中心的较长，末端的较短 (形成菱形轮廓)
                 const maxSubLen = (1.05 - nodeRatio) * maxR * 0.55;
                 const subDist = this.randoms[(i+3)%this.count] * maxSubLen;
                 
                 // 侧枝呈绝对的 60度 (PI/3) 夹角生长以保持完美的冰晶交角
                 const subDir = this.randoms[(i+4)%this.count] > 0.5 ? 1 : -1;
                 const subAngle = (Math.PI / 3) * subDir;
                 
                 sx = nodePos + subDist * Math.cos(subAngle);
                 sy = subDist * Math.sin(subAngle);
                 
                 // 20%的侧枝上再长出次级微小枝干，增加晶体细节 (Secondary tiny twigs)
                 if (this.randoms[(i+5)%this.count] < 0.2) {
                     const microDist = this.randoms[(i+6)%this.count] * maxSubLen * 0.3;
                     const microDir = this.randoms[(i+7)%this.count] > 0.5 ? 1 : -1;
                     const microAngle = subAngle + (Math.PI / 3) * microDir;
                     sx += microDist * Math.cos(microAngle);
                     sy += microDist * Math.sin(microAngle);
                 }
             }
             
             // 收紧粒子离散度，呈现锐利的结晶质感
             const spreadX = (this.randoms[(i+8)%this.count] - 0.5) * 0.4;
             const spreadY = (this.randoms[(i+9)%this.count] - 0.5) * 0.4;
             sx += spreadX;
             sy += spreadY;
             
             // 纯粹的Z轴景深分散，随距中心位置和时间微微起伏闪烁
             const zRipple = Math.sin(sx * 1.5 - this.time * 2.5) * 0.8;
             sz = (this.randoms[(i+10)%this.count] - 0.5) * 1.5 + zRipple;
             
             // 旋转分布到对应的6个分支角度
             x = sx * Math.cos(baseAngle) - sy * Math.sin(baseAngle);
             y = sx * Math.sin(baseAngle) + sy * Math.cos(baseAngle);
             z = sz;
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
    }

    posAttr.needsUpdate = true;
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
