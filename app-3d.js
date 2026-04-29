// app-3d.js — Three.js first-person estate scene
// Step 2 of the 3D integration: an empty walkable space with a starry sky,
// fog, ground, and grid. Seeds, furniture, and theme switching come later.

import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

// ---------- Constants ----------
const TILE = 2;
const PLAYER_HEIGHT = 1.6;
const WORLD_SIZE = 200;
const GRID_SIZE = 100;

const SPEED = 4.5;
const SPRINT_MULT = 1.9;

// ---------- DOM ----------
const canvas        = document.getElementById('scene-canvas');
const startOverlay  = document.getElementById('walkStartOverlay');
const pauseOverlay  = document.getElementById('walkPauseOverlay');
const startBtn      = document.getElementById('walkStartBtn');
const resumeBtn     = document.getElementById('walkResumeBtn');

if (!canvas) {
  console.error('[app-3d] #scene-canvas not found; aborting 3D init.');
} else {
  init();
}

function init() {
  // ---------- Renderer ----------
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  sizeRenderer();
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  // ---------- Scene + Camera ----------
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x14122a, 30, 140);

  const camera = new THREE.PerspectiveCamera(72, getAspect(), 0.1, 500);
  camera.position.set(0, PLAYER_HEIGHT, 6);

  // ---------- Sky dome (gradient shader) ----------
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {
      topColor:    { value: new THREE.Color(0x070612) },
      midColor:    { value: new THREE.Color(0x2a1f4a) },
      bottomColor: { value: new THREE.Color(0x6a4a78) }
    },
    vertexShader: `
      varying vec3 vWorld;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 midColor;
      uniform vec3 bottomColor;
      varying vec3 vWorld;
      void main() {
        float h = normalize(vWorld).y;
        vec3 col = h > 0.0
          ? mix(midColor, topColor, pow(h, 0.55))
          : mix(midColor, bottomColor, pow(-h, 0.7));
        gl_FragColor = vec4(col, 1.0);
      }
    `
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(260, 32, 16), skyMat));

  // ---------- Stars ----------
  const starCount = 900;
  const starPos = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const r = 240;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(Math.random()); // upper hemisphere
    starPos[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
    starPos[i * 3 + 1] = r * Math.cos(phi);
    starPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({
    color: 0xe8d3a8,
    size: 0.55,
    transparent: true,
    opacity: 0.75,
    depthWrite: false
  })));

  // ---------- Lights ----------
  scene.add(new THREE.HemisphereLight(0xc9b8ff, 0x2a1f3a, 0.55));

  const moonLight = new THREE.DirectionalLight(0xfff0d4, 1.0);
  moonLight.position.set(30, 50, 20);
  moonLight.castShadow = true;
  moonLight.shadow.mapSize.set(2048, 2048);
  moonLight.shadow.camera.left   = -50;
  moonLight.shadow.camera.right  =  50;
  moonLight.shadow.camera.top    =  50;
  moonLight.shadow.camera.bottom = -50;
  moonLight.shadow.camera.near   = 0.5;
  moonLight.shadow.camera.far    = 200;
  moonLight.shadow.bias = -0.0008;
  scene.add(moonLight);

  const accent = new THREE.PointLight(0xd4af7a, 1.4, 30, 2);
  accent.position.set(0, 4, 0);
  scene.add(accent);

  // ---------- Ground ----------
  const groundMat = new THREE.MeshStandardMaterial({
    color: 0x1c1830,
    roughness: 0.95,
    metalness: 0.0
  });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // ---------- Grid ----------
  const grid = new THREE.GridHelper(GRID_SIZE, GRID_SIZE / TILE, 0xd4af7a, 0x3a2e5e);
  grid.material.transparent = true;
  grid.material.opacity = 0.35;
  grid.position.y = 0.01;
  scene.add(grid);

  // ---------- Pointer Lock Controls ----------
  const controls = new PointerLockControls(camera, document.body);

  let firstLockDone = false;
  let mode                 = 'walk';     // 'walk' | 'build'
  let suppressPauseOverlay = false;

  controls.addEventListener('lock', () => {
    if (startOverlay) startOverlay.hidden = true;
    if (pauseOverlay) pauseOverlay.hidden = true;
    document.body.classList.add('walk-locked');
    firstLockDone = true;
  });

  controls.addEventListener('unlock', () => {
    document.body.classList.remove('walk-locked');
    if (firstLockDone
        && !suppressPauseOverlay
        && mode === 'walk'
        && !anyModalOpen()
        && pauseOverlay) {
      pauseOverlay.hidden = false;
    }
    suppressPauseOverlay = false;
  });

  startBtn?.addEventListener('click', () => safeLock(controls));
  resumeBtn?.addEventListener('click', () => safeLock(controls));

  // Initial state — start overlay visible until user clicks
  if (startOverlay) startOverlay.hidden = false;
  if (pauseOverlay) pauseOverlay.hidden = true;

  // ---------- Movement ----------
  const keys = Object.create(null);
  document.addEventListener('keydown', (e) => {
    // Don't intercept typing in inputs / textareas
    if (isTypingTarget(e.target)) return;
    keys[e.code] = true;

    if (e.code === 'KeyB' && firstLockDone && !anyModalOpen()) {
      e.preventDefault();
      setMode(mode === 'walk' ? 'build' : 'walk');
    } else if (e.code === 'KeyR' && mode === 'build') {
      e.preventDefault();
      ghostRotation = (ghostRotation + Math.PI / 2) % (Math.PI * 2);
    }
  });
  document.addEventListener('keyup', (e) => {
    keys[e.code] = false;
  });

  const moveDir = new THREE.Vector3();

  function updateMovement(dt) {
    if (!controls.isLocked) return;

    const sprint = keys['ShiftLeft'] || keys['ShiftRight'];
    const speed  = SPEED * (sprint ? SPRINT_MULT : 1);

    const forward = (keys['KeyW'] || keys['ArrowUp']    ? 1 : 0)
                  - (keys['KeyS'] || keys['ArrowDown']  ? 1 : 0);
    const strafe  = (keys['KeyD'] || keys['ArrowRight'] ? 1 : 0)
                  - (keys['KeyA'] || keys['ArrowLeft']  ? 1 : 0);

    moveDir.set(strafe, 0, forward);
    if (moveDir.lengthSq() > 0) moveDir.normalize();

    controls.moveForward(moveDir.z * speed * dt);
    controls.moveRight(moveDir.x * speed * dt);

    // Stay grounded + clamp inside world
    camera.position.y = PLAYER_HEIGHT;
    const half = WORLD_SIZE / 2 - 1;
    camera.position.x = Math.max(-half, Math.min(half, camera.position.x));
    camera.position.z = Math.max(-half, Math.min(half, camera.position.z));
  }

  // ---------- Seeds (orbs by category) ----------
  // Materials shared across all orb instances (cheap; ~20 orbs typical).
  const ORB_MAT = {
    bookCover: new THREE.MeshStandardMaterial({ color: 0x6b3a2e, roughness: 0.6, metalness: 0.1 }),
    bookPage:  new THREE.MeshStandardMaterial({ color: 0xf2e4c0, roughness: 0.85 }),
    bookGold:  new THREE.MeshStandardMaterial({ color: 0xd4af7a, roughness: 0.4,  metalness: 0.65, emissive: 0x3a2810, emissiveIntensity: 0.4 }),
    bulbGlass: new THREE.MeshStandardMaterial({ color: 0xfff2c4, roughness: 0.2,  metalness: 0.0, transparent: true, opacity: 0.85, emissive: 0xffd58a, emissiveIntensity: 1.4 }),
    bulbBase:  new THREE.MeshStandardMaterial({ color: 0xb89968, roughness: 0.45, metalness: 0.7 }),
    crystal:   new THREE.MeshStandardMaterial({ color: 0x9a8aff, roughness: 0.25, metalness: 0.6, emissive: 0x4a3aaa, emissiveIntensity: 0.55, transparent: true, opacity: 0.92 }),
    rocketHull:new THREE.MeshStandardMaterial({ color: 0xeae0d0, roughness: 0.45, metalness: 0.3 }),
    rocketTip: new THREE.MeshStandardMaterial({ color: 0xc94a4a, roughness: 0.55, metalness: 0.1, emissive: 0x6a1a1a, emissiveIntensity: 0.35 }),
    rocketFin: new THREE.MeshStandardMaterial({ color: 0x4a4a5e, roughness: 0.6,  metalness: 0.4 }),
    rocketGlow:new THREE.MeshStandardMaterial({ color: 0xffd58a, emissive: 0xffd58a, emissiveIntensity: 1.5, transparent: true, opacity: 0.7 }),
    insight:   new THREE.MeshStandardMaterial({ color: 0xffd58a, roughness: 0.35, metalness: 0.55, emissive: 0xd4af7a, emissiveIntensity: 0.85 })
  };

  function makeBookOrb() {
    const g = new THREE.Group();
    const cover = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.7, 0.12), ORB_MAT.bookCover);
    const pages = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.65, 0.13), ORB_MAT.bookPage);
    pages.position.z = 0.001;
    const trim  = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.04, 0.13), ORB_MAT.bookGold);
    trim.position.y = 0.32;
    const trim2 = trim.clone(); trim2.position.y = -0.32;
    g.add(cover, pages, trim, trim2);
    g.rotation.set(-0.25, 0.45, 0.0);
    return g;
  }

  function makeIdeaOrb() {
    const g = new THREE.Group();
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.32, 22, 18), ORB_MAT.bulbGlass);
    bulb.position.y = 0.08;
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.16, 16), ORB_MAT.bulbBase);
    neck.position.y = -0.22;
    const cap  = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.06, 16), ORB_MAT.bulbBase);
    cap.position.y = -0.32;
    g.add(bulb, neck, cap);
    // Inner light source — small, cheap point light per idea seed
    const inner = new THREE.PointLight(0xffd58a, 0.9, 4, 2);
    inner.position.y = 0.08;
    g.add(inner);
    return g;
  }

  function makeLearningOrb() {
    const g = new THREE.Group();
    const a = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), ORB_MAT.crystal);
    a.scale.set(1, 1.4, 1);
    g.add(a);
    const b = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), ORB_MAT.crystal);
    b.position.set(0.18, -0.2, 0.15);
    b.scale.set(0.8, 1.1, 0.8);
    g.add(b);
    return g;
  }

  function makeProjectOrb() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.7, 18), ORB_MAT.rocketHull);
    body.position.y = 0.0;
    const tip  = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.32, 18), ORB_MAT.rocketTip);
    tip.position.y = 0.51;
    const win  = new THREE.Mesh(new THREE.SphereGeometry(0.06, 14, 10), ORB_MAT.crystal);
    win.position.set(0, 0.12, 0.18);
    const finGeo = new THREE.BoxGeometry(0.04, 0.18, 0.18);
    const fA = new THREE.Mesh(finGeo, ORB_MAT.rocketFin); fA.position.set( 0.18, -0.32, 0);
    const fB = new THREE.Mesh(finGeo, ORB_MAT.rocketFin); fB.position.set(-0.18, -0.32, 0);
    const fC = new THREE.Mesh(finGeo, ORB_MAT.rocketFin); fC.position.set(0, -0.32,  0.18); fC.rotation.y = Math.PI / 2;
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.32, 14), ORB_MAT.rocketGlow);
    flame.position.y = -0.5; flame.rotation.x = Math.PI;
    g.add(body, tip, win, fA, fB, fC, flame);
    g.rotation.x = -0.18;
    return g;
  }

  function makeInsightOrb() {
    const g = new THREE.Group();
    const star = new THREE.Mesh(new THREE.IcosahedronGeometry(0.36, 0), ORB_MAT.insight);
    g.add(star);
    return g;
  }

  function makeOrbForCategory(category) {
    switch (category) {
      case 'book':     return makeBookOrb();
      case 'idea':     return makeIdeaOrb();
      case 'learning': return makeLearningOrb();
      case 'project':  return makeProjectOrb();
      case 'insight':  return makeInsightOrb();
      default:         return makeBookOrb();
    }
  }

  // Halo disc that sits beneath the orb — fades / brightens with state.
  const HALO_GEO = new THREE.RingGeometry(0.55, 0.7, 32);
  const HALO_MAT_BASE = new THREE.MeshBasicMaterial({
    color: 0xd4af7a, transparent: true, opacity: 0.28,
    side: THREE.DoubleSide, depthWrite: false
  });
  const HALO_MAT_DUE  = new THREE.MeshBasicMaterial({
    color: 0xff8a8a, transparent: true, opacity: 0.42,
    side: THREE.DoubleSide, depthWrite: false
  });

  const seedRoot = new THREE.Group();
  scene.add(seedRoot);
  const seedMap = new Map();          // seed.id -> entry
  const seedClickTargets = [];        // mesh array for raycast (rebuilt on change)

  function buildSeedEntry(seed) {
    // wrap stays anchored at floor (y = 0) for stable x/z positioning
    // and to keep the halo on the ground regardless of orb bobbing.
    const wrap = new THREE.Group();
    wrap.userData.seedId = seed.id;
    wrap.userData.phase  = Math.random() * Math.PI * 2;

    const orb = makeOrbForCategory(seed.category);
    orb.position.y = 1.4; // bob target; animated each frame
    orb.traverse((c) => {
      if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; c.userData.seedId = seed.id; }
    });
    wrap.add(orb);

    const halo = new THREE.Mesh(HALO_GEO, HALO_MAT_BASE);
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = 0.02; // hovers just above the ground plane
    wrap.add(halo);

    return { wrap, orb, halo, type: seed.category };
  }

  function refreshClickTargets() {
    seedClickTargets.length = 0;
    seedRoot.traverse((c) => { if (c.isMesh && c.userData.seedId) seedClickTargets.push(c); });
  }

  function disposeEntry(entry) {
    seedRoot.remove(entry.wrap);
    entry.wrap.traverse((c) => {
      if (c.isMesh && c.geometry && c.geometry !== HALO_GEO) c.geometry.dispose();
    });
  }

  // Public hook called by app-core.js render()
  window.render3D = function (seeds /*, opts */) {
    const seen = new Set();
    for (const seed of seeds) {
      seen.add(seed.id);
      let entry = seedMap.get(seed.id);
      if (!entry) {
        entry = buildSeedEntry(seed);
        seedRoot.add(entry.wrap);
        seedMap.set(seed.id, entry);
      } else if (entry.type !== seed.category) {
        disposeEntry(entry);
        entry = buildSeedEntry(seed);
        seedRoot.add(entry.wrap);
        seedMap.set(seed.id, entry);
      }
      // 2D% → 3D world position (centered on origin, 1m grid units)
      entry.wrap.position.x = (seed.x - 50) * 0.4;
      entry.wrap.position.z = (seed.y - 50) * 0.4;

      const due = typeof window.isDueToday === 'function' && window.isDueToday(seed);
      entry.halo.material = due ? HALO_MAT_DUE : HALO_MAT_BASE;
    }
    // Remove deleted seeds
    for (const [id, entry] of seedMap) {
      if (!seen.has(id)) {
        disposeEntry(entry);
        seedMap.delete(id);
      }
    }
    refreshClickTargets();
  };

  // ---------- Raycaster (shared by walk + build modes) ----------
  const raycaster    = new THREE.Raycaster();
  const screenCenter = new THREE.Vector2(0, 0);

  // ---------- Furniture system ----------
  const FURNITURE_STORAGE_KEY = 'knowledge_estate_furniture_v1';
  const FURNITURE_NAMES = {
    bookshelf: '本棚',
    desk:      'デスク',
    sofa:      'ソファ',
    plant:     '観葉植物'
  };

  const F = {
    walnut:  new THREE.MeshStandardMaterial({ color: 0x4a3424, roughness: 0.7,  metalness: 0.06 }),
    oak:     new THREE.MeshStandardMaterial({ color: 0xb89968, roughness: 0.65, metalness: 0.05 }),
    cream:   new THREE.MeshStandardMaterial({ color: 0xe8dcc4, roughness: 0.85 }),
    fabric:  new THREE.MeshStandardMaterial({ color: 0x4a4860, roughness: 0.95 }),
    cushion: new THREE.MeshStandardMaterial({ color: 0x6a6680, roughness: 0.95 }),
    metal:   new THREE.MeshStandardMaterial({ color: 0x2a2a32, roughness: 0.35, metalness: 0.75 }),
    ceramic: new THREE.MeshStandardMaterial({ color: 0xc9b8a6, roughness: 0.5,  metalness: 0.05 }),
    soil:    new THREE.MeshStandardMaterial({ color: 0x2a2018, roughness: 0.95 }),
    leaf:    new THREE.MeshStandardMaterial({ color: 0x3a6a48, roughness: 0.7 }),
    leafD:   new THREE.MeshStandardMaterial({ color: 0x2a4a30, roughness: 0.7 }),
    bookA:   new THREE.MeshStandardMaterial({ color: 0x8a3a3a, roughness: 0.8 }),
    bookB:   new THREE.MeshStandardMaterial({ color: 0x3a5a8a, roughness: 0.8 }),
    bookC:   new THREE.MeshStandardMaterial({ color: 0xc9a878, roughness: 0.8 }),
    bookD:   new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.8 }),
    gold:    new THREE.MeshStandardMaterial({ color: 0xd4af7a, roughness: 0.4,  metalness: 0.6 }),
    stem:    new THREE.MeshStandardMaterial({ color: 0x4a3a28, roughness: 0.9 })
  };

  function applyFurnitureShadows(group) {
    group.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
  }

  function makeBookshelf() {
    const g = new THREE.Group();
    const W = 1.2, D = 0.4, H = 1.65;
    const body = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), F.walnut);
    body.position.y = H / 2;
    g.add(body);
    const back = new THREE.Mesh(new THREE.BoxGeometry(W - 0.06, H - 0.06, 0.02), F.cream);
    back.position.set(0, H / 2, -D / 2 + 0.025);
    g.add(back);
    for (let i = 1; i <= 3; i++) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(W - 0.08, 0.025, D - 0.06), F.cream);
      s.position.set(0, (H / 4) * i, 0.005);
      g.add(s);
    }
    const bookMats = [F.bookA, F.bookB, F.bookC, F.bookD];
    for (let row = 0; row < 4; row++) {
      const yBase = (H / 4) * row + 0.04;
      let x = -W / 2 + 0.08;
      let i = 0;
      while (x < W / 2 - 0.1) {
        const bw = 0.08 + ((row * 7 + i * 13) % 5) * 0.012;
        const bh = 0.22 + ((row * 11 + i * 5) % 8) * 0.014;
        const mat = bookMats[(row * 3 + i) % bookMats.length];
        const book = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, D - 0.12), mat);
        book.position.set(x + bw / 2, yBase + bh / 2, 0.01);
        g.add(book);
        x += bw + 0.006;
        i++;
      }
    }
    const trim = new THREE.Mesh(new THREE.BoxGeometry(W + 0.05, 0.04, D + 0.04), F.gold);
    trim.position.y = H + 0.005;
    g.add(trim);
    applyFurnitureShadows(g);
    return g;
  }

  function makeDesk() {
    const g = new THREE.Group();
    const W = 1.4, D = 0.65, H = 0.74;
    const top = new THREE.Mesh(new THREE.BoxGeometry(W, 0.04, D), F.oak);
    top.position.y = H;
    g.add(top);
    const legGeo = new THREE.CylinderGeometry(0.025, 0.025, H, 12);
    for (const [x, z] of [[ W/2-0.08,-D/2+0.08],[-W/2+0.08,-D/2+0.08],[ W/2-0.08, D/2-0.08],[-W/2+0.08, D/2-0.08]]) {
      const leg = new THREE.Mesh(legGeo, F.metal);
      leg.position.set(x, H / 2, z);
      g.add(leg);
    }
    const drawer = new THREE.Mesh(new THREE.BoxGeometry(W * 0.45, 0.12, D - 0.1), F.walnut);
    drawer.position.set(W * 0.22, H - 0.1, 0);
    g.add(drawer);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.015, 0.03), F.gold);
    handle.position.set(W * 0.22, H - 0.1, D / 2 - 0.04);
    g.add(handle);
    applyFurnitureShadows(g);
    return g;
  }

  function makeSofa() {
    const g = new THREE.Group();
    const W = 1.7, D = 0.85, H = 0.78;
    const base = new THREE.Mesh(new THREE.BoxGeometry(W, 0.32, D), F.fabric);
    base.position.y = 0.18;
    g.add(base);
    const back = new THREE.Mesh(new THREE.BoxGeometry(W, H - 0.34, 0.18), F.fabric);
    back.position.set(0, 0.18 + (H - 0.34) / 2, -D / 2 + 0.09);
    g.add(back);
    const armGeo = new THREE.BoxGeometry(0.18, 0.42, D - 0.05);
    const armL = new THREE.Mesh(armGeo, F.fabric); armL.position.set(-W / 2 + 0.09, 0.21, 0);
    const armR = new THREE.Mesh(armGeo, F.fabric); armR.position.set( W / 2 - 0.09, 0.21, 0);
    g.add(armL, armR);
    const cushW = (W - 0.4) / 2 - 0.03;
    const cushGeo = new THREE.BoxGeometry(cushW, 0.16, D - 0.25);
    const cushL = new THREE.Mesh(cushGeo, F.cushion); cushL.position.set(-cushW / 2 - 0.03, 0.42, 0.05);
    const cushR = new THREE.Mesh(cushGeo, F.cushion); cushR.position.set( cushW / 2 + 0.03, 0.42, 0.05);
    g.add(cushL, cushR);
    const footGeo = new THREE.BoxGeometry(0.05, 0.06, 0.05);
    for (const [x, z] of [[W/2-0.1,D/2-0.1],[-W/2+0.1,D/2-0.1],[W/2-0.1,-D/2+0.1],[-W/2+0.1,-D/2+0.1]]) {
      const foot = new THREE.Mesh(footGeo, F.metal);
      foot.position.set(x, 0.03, z);
      g.add(foot);
    }
    applyFurnitureShadows(g);
    return g;
  }

  function makePlant() {
    const g = new THREE.Group();
    const potH = 0.42;
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.2, potH, 16), F.ceramic);
    pot.position.y = potH / 2;
    g.add(pot);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.018, 8, 24), F.gold);
    rim.position.y = potH; rim.rotation.x = Math.PI / 2;
    g.add(rim);
    const soil = new THREE.Mesh(new THREE.CylinderGeometry(0.245, 0.245, 0.02, 16), F.soil);
    soil.position.y = potH - 0.005;
    g.add(soil);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.025, 0.55, 8), F.stem);
    stem.position.y = potH + 0.27;
    g.add(stem);
    const foliage = [
      { y: 0.78, x:  0.0,  z:  0.0,  r: 0.30, s: [1.2, 1.0, 1.2], m: F.leaf  },
      { y: 0.95, x: -0.18, z:  0.05, r: 0.26, s: [1.0, 0.9, 1.0], m: F.leafD },
      { y: 0.95, x:  0.18, z: -0.05, r: 0.26, s: [1.0, 0.9, 1.0], m: F.leaf  },
      { y: 1.05, x:  0.04, z:  0.18, r: 0.24, s: [1.0, 0.9, 1.0], m: F.leafD },
      { y: 1.18, x:  0.0,  z:  0.0,  r: 0.22, s: [0.95, 0.85, 0.95], m: F.leaf }
    ];
    for (const f of foliage) {
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(f.r, 14, 10), f.m);
      leaf.scale.set(...f.s);
      leaf.position.set(f.x, f.y, f.z);
      g.add(leaf);
    }
    applyFurnitureShadows(g);
    return g;
  }

  const FURNITURE_BUILD = {
    bookshelf: makeBookshelf,
    desk:      makeDesk,
    sofa:      makeSofa,
    plant:     makePlant
  };

  // ----- State -----
  const placedFurniture = [];
  const furnitureMap    = new Map(); // "ix,iz" -> root group
  let selectedFurniture = null;
  let ghost             = null;
  let ghostRotation     = 0;

  // ----- Floor highlight tile (used to flag valid/blocked placement) -----
  const highlightMat = new THREE.MeshBasicMaterial({
    color: 0xe8d3a8, transparent: true, opacity: 0.28,
    side: THREE.DoubleSide, depthWrite: false
  });
  const highlight = new THREE.Mesh(new THREE.PlaneGeometry(TILE * 0.96, TILE * 0.96), highlightMat);
  highlight.rotation.x = -Math.PI / 2;
  highlight.position.y = 0.02;
  highlight.visible = false;
  scene.add(highlight);

  // ----- Mouse position (build mode raycast input) -----
  const mouseNDC = new THREE.Vector2(-2, -2);
  let mouseOverCanvas = false;
  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouseNDC.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1;
    mouseNDC.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
    mouseOverCanvas = true;
  });
  canvas.addEventListener('mouseenter', () => { mouseOverCanvas = true;  });
  canvas.addEventListener('mouseleave', () => { mouseOverCanvas = false; });

  function ensureGhost(type) {
    if (ghost && ghost.userData.type === type) return ghost;
    if (ghost) {
      scene.remove(ghost);
      ghost.traverse((c) => { if (c.isMesh && c.geometry) c.geometry.dispose(); });
    }
    const g = FURNITURE_BUILD[type]();
    g.traverse((c) => {
      if (c.isMesh) {
        c.castShadow = false;
        c.receiveShadow = false;
        c.material = c.material.clone();
        c.material.transparent = true;
        c.material.opacity = 0.55;
        c.material.depthWrite = false;
        c.material.emissive = new THREE.Color(0xd4af7a);
        c.material.emissiveIntensity = 0.18;
      }
    });
    g.userData.type = type;
    scene.add(g);
    ghost = g;
    return ghost;
  }

  function clearGhost() {
    if (ghost) {
      scene.remove(ghost);
      ghost.traverse((c) => { if (c.isMesh && c.geometry) c.geometry.dispose(); });
      ghost = null;
    }
  }

  function buildAimedTile() {
    raycaster.setFromCamera(mouseNDC, camera);
    const hits = raycaster.intersectObject(ground);
    if (!hits.length) return null;
    const p = hits[0].point;
    return { ix: Math.round(p.x / TILE), iz: Math.round(p.z / TILE) };
  }

  function aimedFurniture() {
    if (!placedFurniture.length) return null;
    raycaster.setFromCamera(mouseNDC, camera);
    const meshes = [];
    for (const f of placedFurniture) f.traverse((c) => { if (c.isMesh) meshes.push(c); });
    const hits = raycaster.intersectObjects(meshes);
    if (!hits.length) return null;
    let obj = hits[0].object;
    while (obj && !obj.userData.isFurniture) obj = obj.parent;
    return obj || null;
  }

  function instantiateFurniture(type, ix, iz, rot) {
    const g = FURNITURE_BUILD[type]();
    g.position.set(ix * TILE, 0, iz * TILE);
    g.rotation.y = rot;
    g.userData = { isFurniture: true, type, key: `${ix},${iz}`, ix, iz, rot };
    scene.add(g);
    placedFurniture.push(g);
    furnitureMap.set(g.userData.key, g);
    return g;
  }

  function placeFurniture() {
    if (!selectedFurniture || !ghost || !ghost.visible) return;
    const ix = Math.round(ghost.position.x / TILE);
    const iz = Math.round(ghost.position.z / TILE);
    const key = `${ix},${iz}`;
    if (furnitureMap.has(key)) return;
    instantiateFurniture(selectedFurniture, ix, iz, ghostRotation);
    saveFurniture();
  }

  function removeFurniture() {
    const obj = aimedFurniture();
    if (!obj) return;
    scene.remove(obj);
    furnitureMap.delete(obj.userData.key);
    const i = placedFurniture.indexOf(obj);
    if (i >= 0) placedFurniture.splice(i, 1);
    obj.traverse((c) => { if (c.isMesh && c.geometry) c.geometry.dispose(); });
    saveFurniture();
  }

  function updateBuildAim() {
    if (mode !== 'build' || !selectedFurniture || !mouseOverCanvas) {
      if (ghost) ghost.visible = false;
      highlight.visible = false;
      return;
    }
    ensureGhost(selectedFurniture);
    const tile = buildAimedTile();
    if (!tile) {
      ghost.visible = false;
      highlight.visible = false;
      return;
    }
    const key = `${tile.ix},${tile.iz}`;
    const occupied = furnitureMap.has(key);
    ghost.visible = !occupied;
    ghost.position.set(tile.ix * TILE, 0, tile.iz * TILE);
    ghost.rotation.y = ghostRotation;

    highlight.visible = true;
    highlight.position.set(tile.ix * TILE, 0.02, tile.iz * TILE);
    highlightMat.color.setHex(occupied ? 0xff8a8a : 0xe8d3a8);
    highlightMat.opacity = occupied ? 0.22 : 0.32;
  }

  // ----- Persistence -----
  function saveFurniture() {
    const arr = placedFurniture.map(g => ({
      type: g.userData.type,
      ix:   g.userData.ix,
      iz:   g.userData.iz,
      rot:  g.rotation.y
    }));
    try { localStorage.setItem(FURNITURE_STORAGE_KEY, JSON.stringify(arr)); } catch { /* quota */ }
  }

  function loadFurniture() {
    let arr;
    try { arr = JSON.parse(localStorage.getItem(FURNITURE_STORAGE_KEY) || '[]'); }
    catch { return; }
    if (!Array.isArray(arr)) return;
    for (const item of arr) {
      if (!item || !FURNITURE_BUILD[item.type]) continue;
      const ix  = Number.isFinite(item.ix)  ? item.ix  : 0;
      const iz  = Number.isFinite(item.iz)  ? item.iz  : 0;
      const rot = Number.isFinite(item.rot) ? item.rot : 0;
      if (furnitureMap.has(`${ix},${iz}`)) continue;
      instantiateFurniture(item.type, ix, iz, rot);
    }
  }

  // ----- Build panel UI wiring -----
  const buildPanel       = document.getElementById('buildPanel');
  const selectionInfo    = document.getElementById('furnitureSelectionInfo');
  const exitBuildBtn     = document.getElementById('exitBuildBtn');
  const modeLabel        = document.getElementById('modeLabel');
  const modeKeys         = document.getElementById('modeKeys');
  const catItems         = document.querySelectorAll('.cat-item');

  function setSelectionDisplay(name) {
    if (!selectionInfo) return;
    if (name) {
      selectionInfo.textContent = `選択中：${name}（R で回転）`;
      selectionInfo.classList.add('has-selection');
    } else {
      selectionInfo.textContent = '家具を選んでください';
      selectionInfo.classList.remove('has-selection');
    }
  }

  function clearSelection() {
    selectedFurniture = null;
    catItems.forEach((b) => b.classList.remove('active'));
    setSelectionDisplay(null);
    clearGhost();
  }

  catItems.forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.item;
      if (selectedFurniture === id) { clearSelection(); return; }
      selectedFurniture = id;
      ghostRotation = 0;
      catItems.forEach((b) => b.classList.toggle('active', b === btn));
      setSelectionDisplay(FURNITURE_NAMES[id] ?? id);
    });
  });

  exitBuildBtn?.addEventListener('click', () => setMode('walk'));

  // ----- Mode toggle -----
  function setMode(next) {
    if (next === mode) return;
    mode = next;
    if (mode === 'build') {
      document.body.classList.remove('walk-locked');
      document.body.classList.add('build-mode');
      if (modeLabel) modeLabel.textContent = 'Build';
      if (modeKeys)  modeKeys.textContent  = 'クリックで配置 / 右クリックで撤去 / R で回転 / B で歩行';
      if (controls.isLocked) {
        suppressPauseOverlay = true;
        controls.unlock();
      }
      if (pauseOverlay) pauseOverlay.hidden = true;
    } else {
      document.body.classList.remove('build-mode');
      if (modeLabel) modeLabel.textContent = 'Walk';
      if (modeKeys)  modeKeys.textContent  = 'WASD移動 / マウス視点 / B でビルド';
      clearSelection();
      highlight.visible = false;
      if (firstLockDone) {
        try { controls.lock(); } catch { /* cooldown */ }
      }
    }
  }

  // ---------- Click dispatch (walk = open seed modal, build = place/remove) ----------
  document.addEventListener('mousedown', (e) => {
    if (mode === 'build') {
      if (e.target !== canvas) return;            // ignore clicks on UI panel
      if (e.button === 0) placeFurniture();
      else if (e.button === 2) removeFurniture();
      return;
    }
    // walk mode — click on a seed orb opens its modal
    if (e.button !== 0) return;
    if (!controls.isLocked) return;
    if (!seedClickTargets.length) return;

    raycaster.setFromCamera(screenCenter, camera);
    const hits = raycaster.intersectObjects(seedClickTargets, false);
    if (!hits.length) return;
    if (hits[0].distance > 25) return;

    let obj = hits[0].object;
    while (obj && !obj.userData.seedId) obj = obj.parent;
    if (!obj) return;

    const id = obj.userData.seedId;
    if (typeof window.openSeedModal === 'function') {
      window.openSeedModal(id);
      controls.unlock();
    }
  });

  document.addEventListener('contextmenu', (e) => {
    // Suppress browser menu inside the canvas while building so right-click
    // can be used to remove furniture.
    if (mode === 'build' && e.target === canvas) e.preventDefault();
  });

  // ---------- Modal close → restore pause overlay ----------
  // After the user closes a seed modal, the pointer is still unlocked
  // and no overlay is visible. Watch for any modal becoming hidden again
  // and re-show the pause card so the user has a clear path back.
  const modalObserver = new MutationObserver(() => {
    if (firstLockDone
        && !controls.isLocked
        && mode === 'walk'
        && !anyModalOpen()
        && pauseOverlay
        && pauseOverlay.hidden) {
      pauseOverlay.hidden = false;
    }
  });
  document.querySelectorAll('.modal-overlay').forEach((m) => {
    modalObserver.observe(m, { attributes: true, attributeFilter: ['hidden'] });
  });

  // ---------- Resize ----------
  function getAspect() {
    const w = canvas.clientWidth  || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    return w / h;
  }

  function sizeRenderer() {
    const w = canvas.clientWidth  || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
  }

  window.addEventListener('resize', () => {
    camera.aspect = getAspect();
    camera.updateProjectionMatrix();
    sizeRenderer();
  });

  // ---------- Animate ----------
  const clock = new THREE.Clock();
  function animateOrbs(t) {
    for (const entry of seedMap.values()) {
      const phase = entry.wrap.userData.phase || 0;
      entry.orb.position.y = 1.4 + Math.sin(t * 1.4 + phase) * 0.08;
      entry.orb.rotation.y = t * 0.4 + phase;
    }
  }

  function animate() {
    const dt = Math.min(clock.getDelta(), 0.1);
    const t  = performance.now() * 0.001;
    updateMovement(dt);
    animateOrbs(t);
    updateBuildAim();
    accent.intensity = 1.2 + Math.sin(t * 1.5) * 0.25;
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }

  // Restore the user's previously saved furniture before the first frame.
  loadFurniture();

  animate();

  // Seeds that loaded before this module initialized are now visible —
  // ask app-core.js to re-render so window.render3D gets called.
  if (typeof window.render === 'function') {
    try { window.render(); } catch { /* boot order edge cases — ignore */ }
  }
}

// ---------- Helpers ----------
function isTypingTarget(el) {
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable;
}

function anyModalOpen() {
  return Array.from(document.querySelectorAll('.modal-overlay'))
    .some((m) => !m.hidden);
}

function safeLock(controls) {
  // Pointer lock requires a user gesture; calling it from a click is safe.
  // If a browser cool-down is active (rapid lock/unlock), the call is a no-op
  // and the start/pause overlay stays visible — user can click again.
  if (anyModalOpen()) return;
  try { controls.lock(); } catch { /* ignore */ }
}
