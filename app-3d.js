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

  controls.addEventListener('lock', () => {
    if (startOverlay) startOverlay.hidden = true;
    if (pauseOverlay) pauseOverlay.hidden = true;
    document.body.classList.add('walk-locked');
    firstLockDone = true;
  });

  controls.addEventListener('unlock', () => {
    document.body.classList.remove('walk-locked');
    // Only show pause overlay if no app-level modal is currently open.
    if (firstLockDone && !anyModalOpen() && pauseOverlay) {
      pauseOverlay.hidden = false;
    }
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

  // ---------- Click → open seed modal ----------
  const raycaster    = new THREE.Raycaster();
  const screenCenter = new THREE.Vector2(0, 0);

  document.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    if (!controls.isLocked) return; // ignore clicks while paused / on overlays
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
      // Open modal first so the unlock handler sees a modal already open
      // and skips showing the pause overlay.
      window.openSeedModal(id);
      controls.unlock();
    }
  });

  // ---------- Modal close → restore pause overlay ----------
  // After the user closes a seed modal, the pointer is still unlocked
  // and no overlay is visible. Watch for any modal becoming hidden again
  // and re-show the pause card so the user has a clear path back.
  const modalObserver = new MutationObserver(() => {
    if (firstLockDone && !controls.isLocked && !anyModalOpen() && pauseOverlay && pauseOverlay.hidden) {
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
    accent.intensity = 1.2 + Math.sin(t * 1.5) * 0.25;
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }
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
