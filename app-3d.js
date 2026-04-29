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
  function animate() {
    const dt = Math.min(clock.getDelta(), 0.1);
    updateMovement(dt);
    accent.intensity = 1.2 + Math.sin(performance.now() * 0.0015) * 0.25;
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }
  animate();
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
