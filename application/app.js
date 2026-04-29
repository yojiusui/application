import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

// ---------- Constants ----------
const TILE = 2;
const PLAYER_HEIGHT = 1.6;
const WORLD_SIZE = 200;
const GRID_SIZE = 100;

// ---------- Scene ----------
const canvas = document.getElementById('scene');
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x14122a, 30, 140);

const camera = new THREE.PerspectiveCamera(
  72,
  window.innerWidth / window.innerHeight,
  0.1,
  500
);
camera.position.set(0, PLAYER_HEIGHT, 6);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

// ---------- Sky ----------
const skyGeo = new THREE.SphereGeometry(260, 32, 16);
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
scene.add(new THREE.Mesh(skyGeo, skyMat));

// Stars
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
moonLight.shadow.camera.left = -50;
moonLight.shadow.camera.right = 50;
moonLight.shadow.camera.top = 50;
moonLight.shadow.camera.bottom = -50;
moonLight.shadow.camera.near = 0.5;
moonLight.shadow.camera.far = 200;
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
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE),
  groundMat
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// ---------- Grid ----------
const grid = new THREE.GridHelper(GRID_SIZE, GRID_SIZE / TILE, 0xd4af7a, 0x3a2e5e);
grid.material.transparent = true;
grid.material.opacity = 0.35;
grid.position.y = 0.01;
scene.add(grid);

// Highlight tile (where the player is aiming)
const highlightGeo = new THREE.PlaneGeometry(TILE * 0.96, TILE * 0.96);
const highlightMat = new THREE.MeshBasicMaterial({
  color: 0xe8d3a8,
  transparent: true,
  opacity: 0.25,
  side: THREE.DoubleSide,
  depthWrite: false
});
const highlight = new THREE.Mesh(highlightGeo, highlightMat);
highlight.rotation.x = -Math.PI / 2;
highlight.position.y = 0.02;
highlight.visible = false;
scene.add(highlight);

// ---------- Controls ----------
const controls = new PointerLockControls(camera, document.body);
const startOverlay = document.getElementById('start-overlay');
const pauseOverlay = document.getElementById('pause-overlay');

document.getElementById('start-btn').addEventListener('click', () => controls.lock());
document.getElementById('resume-btn').addEventListener('click', () => controls.lock());

let firstLockDone = false;
let mode = 'walk';
let suppressPauseOverlay = false;
controls.addEventListener('lock', () => {
  startOverlay.hidden = true;
  pauseOverlay.hidden = true;
  document.body.classList.add('locked');
  firstLockDone = true;
});
controls.addEventListener('unlock', () => {
  document.body.classList.remove('locked');
  if (firstLockDone && !suppressPauseOverlay && mode === 'walk') {
    pauseOverlay.hidden = false;
  }
  suppressPauseOverlay = false;
});

// ---------- Movement ----------
const keys = Object.create(null);
document.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'KeyB' && startOverlay.hidden) {
    e.preventDefault();
    setMode(mode === 'walk' ? 'build' : 'walk');
  }
});
document.addEventListener('keyup',   (e) => { keys[e.code] = false; });

const SPEED = 4.5;
const SPRINT_MULT = 1.9;
const dir = new THREE.Vector3();

function updateMovement(dt) {
  if (!controls.isLocked) return;
  const sprint = keys['ShiftLeft'] || keys['ShiftRight'];
  const speed = SPEED * (sprint ? SPRINT_MULT : 1);

  const forward = (keys['KeyW'] || keys['ArrowUp']   ? 1 : 0)
                - (keys['KeyS'] || keys['ArrowDown'] ? 1 : 0);
  const strafe  = (keys['KeyD'] || keys['ArrowRight'] ? 1 : 0)
                - (keys['KeyA'] || keys['ArrowLeft']  ? 1 : 0);

  dir.set(strafe, 0, forward);
  if (dir.lengthSq() > 0) dir.normalize();

  controls.moveForward(dir.z * speed * dt);
  controls.moveRight(dir.x * speed * dt);

  // keep grounded + clamp inside world
  camera.position.y = PLAYER_HEIGHT;
  const half = WORLD_SIZE / 2 - 1;
  camera.position.x = Math.max(-half, Math.min(half, camera.position.x));
  camera.position.z = Math.max(-half, Math.min(half, camera.position.z));
}

// ---------- Cube placement ----------
const cubeMat = new THREE.MeshStandardMaterial({
  color: 0xc9a878,
  roughness: 0.55,
  metalness: 0.08
});
const cubeEdgeMat = new THREE.LineBasicMaterial({ color: 0x4a3820, transparent: true, opacity: 0.5 });
const cubeGeo = new THREE.BoxGeometry(TILE, TILE, TILE);
const cubeEdgeGeo = new THREE.EdgesGeometry(cubeGeo);

const cubes = [];
const tileMap = new Map(); // "x,z" -> cube mesh

const raycaster = new THREE.Raycaster();
const screenCenter = new THREE.Vector2(0, 0);

function aimedTile() {
  raycaster.setFromCamera(screenCenter, camera);
  const hits = raycaster.intersectObject(ground);
  if (!hits.length) return null;
  const p = hits[0].point;
  const ix = Math.round(p.x / TILE);
  const iz = Math.round(p.z / TILE);
  // limit reach
  const dist = camera.position.distanceTo(new THREE.Vector3(ix * TILE, 0, iz * TILE));
  if (dist > 14) return null;
  return { ix, iz };
}

function aimedCube() {
  raycaster.setFromCamera(screenCenter, camera);
  const hits = raycaster.intersectObjects(cubes, false);
  if (!hits.length) return null;
  if (hits[0].distance > 14) return null;
  return hits[0].object;
}

function placeCube() {
  const tile = aimedTile();
  if (!tile) return;
  const key = `${tile.ix},${tile.iz}`;
  if (tileMap.has(key)) return;

  const cube = new THREE.Mesh(cubeGeo, cubeMat);
  cube.position.set(tile.ix * TILE, TILE / 2, tile.iz * TILE);
  cube.castShadow = true;
  cube.receiveShadow = true;
  cube.userData.tileKey = key;

  const edges = new THREE.LineSegments(cubeEdgeGeo, cubeEdgeMat);
  cube.add(edges);

  scene.add(cube);
  cubes.push(cube);
  tileMap.set(key, cube);
}

function removeCube() {
  const cube = aimedCube();
  if (!cube) return;
  scene.remove(cube);
  tileMap.delete(cube.userData.tileKey);
  cubes.splice(cubes.indexOf(cube), 1);
}

document.addEventListener('mousedown', (e) => {
  if (!controls.isLocked) return;
  if (e.button === 0) placeCube();
  else if (e.button === 2) removeCube();
});
document.addEventListener('contextmenu', (e) => e.preventDefault());

// ---------- Highlight loop ----------
function updateHighlight() {
  if (!controls.isLocked) {
    highlight.visible = false;
    return;
  }
  const tile = aimedTile();
  if (!tile) {
    highlight.visible = false;
    return;
  }
  const key = `${tile.ix},${tile.iz}`;
  const occupied = tileMap.has(key);
  highlight.visible = true;
  highlight.position.x = tile.ix * TILE;
  highlight.position.z = tile.iz * TILE;
  highlightMat.color.setHex(occupied ? 0xff8a8a : 0xe8d3a8);
  highlightMat.opacity = occupied ? 0.18 : 0.28;
}

// ---------- Resize ----------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- Mode toggle (walk / build) ----------
const modeLabel    = document.getElementById('mode-label');
const modeKeys     = document.getElementById('mode-keys');
const selectionInfo = document.getElementById('selection-info');

const FURNITURE_NAMES = {
  bookshelf: '本棚',
  desk:      'デスク',
  sofa:      'ソファ',
  plant:     '観葉植物'
};
let selectedFurniture = null;

function setMode(next) {
  if (next === mode) return;
  mode = next;
  if (mode === 'build') {
    document.body.classList.remove('walk-mode');
    document.body.classList.add('build-mode');
    modeLabel.textContent = 'Build Mode';
    modeKeys.textContent  = '家具を選んで配置 / B で歩行に戻る';
    if (controls.isLocked) {
      suppressPauseOverlay = true;
      controls.unlock();
    }
  } else {
    document.body.classList.remove('build-mode');
    document.body.classList.add('walk-mode');
    modeLabel.textContent = 'Walk Mode';
    modeKeys.textContent  = 'WASD移動 / Mouse視点 / 左クリックで設置 / B でビルド';
    if (firstLockDone) controls.lock();
  }
}

document.querySelectorAll('.cat-item').forEach((btn) => {
  btn.addEventListener('click', () => {
    const id = btn.dataset.item;
    selectedFurniture = id;
    document.querySelectorAll('.cat-item').forEach((b) => {
      b.classList.toggle('active', b === btn);
    });
    const name = FURNITURE_NAMES[id] ?? id;
    selectionInfo.textContent = `選択中：${name}`;
    selectionInfo.classList.add('has-selection');
    console.log(`選択中：${name}`);
  });
});

document.getElementById('exit-build-btn')?.addEventListener('click', () => setMode('walk'));

// ---------- Animate ----------
const clock = new THREE.Clock();
function animate() {
  const dt = Math.min(clock.getDelta(), 0.1);
  updateMovement(dt);
  updateHighlight();
  // gentle accent pulse
  accent.intensity = 1.2 + Math.sin(performance.now() * 0.0015) * 0.25;
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
animate();
