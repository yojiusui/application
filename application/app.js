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
  } else if (e.code === 'KeyR' && mode === 'build') {
    e.preventDefault();
    ghostRotation = (ghostRotation + Math.PI / 2) % (Math.PI * 2);
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

// ---------- Furniture system ----------
const M = {
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
  gold:    new THREE.MeshStandardMaterial({ color: 0xd4af7a, roughness: 0.4,  metalness: 0.6 })
};

function applyShadows(group) {
  group.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
}

function makeBookshelf() {
  const g = new THREE.Group();
  const W = 1.2, D = 0.4, H = 1.65;
  const body = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), M.walnut);
  body.position.y = H / 2;
  g.add(body);
  const back = new THREE.Mesh(new THREE.BoxGeometry(W - 0.06, H - 0.06, 0.02), M.cream);
  back.position.set(0, H / 2, -D / 2 + 0.025);
  g.add(back);
  for (let i = 1; i <= 3; i++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(W - 0.08, 0.025, D - 0.06), M.cream);
    s.position.set(0, (H / 4) * i, 0.005);
    g.add(s);
  }
  const bookMats = [M.bookA, M.bookB, M.bookC, M.bookD];
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
  const trim = new THREE.Mesh(new THREE.BoxGeometry(W + 0.05, 0.04, D + 0.04), M.gold);
  trim.position.y = H + 0.005;
  g.add(trim);
  applyShadows(g);
  return g;
}

function makeDesk() {
  const g = new THREE.Group();
  const W = 1.4, D = 0.65, H = 0.74;
  const top = new THREE.Mesh(new THREE.BoxGeometry(W, 0.04, D), M.oak);
  top.position.y = H;
  g.add(top);
  const legGeo = new THREE.CylinderGeometry(0.025, 0.025, H, 12);
  const legPos = [
    [ W / 2 - 0.08, -D / 2 + 0.08],
    [-W / 2 + 0.08, -D / 2 + 0.08],
    [ W / 2 - 0.08,  D / 2 - 0.08],
    [-W / 2 + 0.08,  D / 2 - 0.08]
  ];
  for (const [x, z] of legPos) {
    const leg = new THREE.Mesh(legGeo, M.metal);
    leg.position.set(x, H / 2, z);
    g.add(leg);
  }
  const drawer = new THREE.Mesh(new THREE.BoxGeometry(W * 0.45, 0.12, D - 0.1), M.walnut);
  drawer.position.set(W * 0.22, H - 0.1, 0);
  g.add(drawer);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.015, 0.03), M.gold);
  handle.position.set(W * 0.22, H - 0.1, D / 2 - 0.04);
  g.add(handle);
  applyShadows(g);
  return g;
}

function makeSofa() {
  const g = new THREE.Group();
  const W = 1.7, D = 0.85, H = 0.78;
  const base = new THREE.Mesh(new THREE.BoxGeometry(W, 0.32, D), M.fabric);
  base.position.y = 0.18;
  g.add(base);
  const back = new THREE.Mesh(new THREE.BoxGeometry(W, H - 0.34, 0.18), M.fabric);
  back.position.set(0, 0.18 + (H - 0.34) / 2, -D / 2 + 0.09);
  g.add(back);
  const armGeo = new THREE.BoxGeometry(0.18, 0.42, D - 0.05);
  const armL = new THREE.Mesh(armGeo, M.fabric);
  armL.position.set(-W / 2 + 0.09, 0.21, 0);
  const armR = new THREE.Mesh(armGeo, M.fabric);
  armR.position.set(W / 2 - 0.09, 0.21, 0);
  g.add(armL, armR);
  const cushW = (W - 0.4) / 2 - 0.03;
  const cushGeo = new THREE.BoxGeometry(cushW, 0.16, D - 0.25);
  const cushL = new THREE.Mesh(cushGeo, M.cushion);
  cushL.position.set(-cushW / 2 - 0.03, 0.42, 0.05);
  const cushR = new THREE.Mesh(cushGeo, M.cushion);
  cushR.position.set( cushW / 2 + 0.03, 0.42, 0.05);
  g.add(cushL, cushR);
  const footGeo = new THREE.BoxGeometry(0.05, 0.06, 0.05);
  for (const [x, z] of [[W/2-0.1, D/2-0.1], [-W/2+0.1, D/2-0.1], [W/2-0.1, -D/2+0.1], [-W/2+0.1, -D/2+0.1]]) {
    const foot = new THREE.Mesh(footGeo, M.metal);
    foot.position.set(x, 0.03, z);
    g.add(foot);
  }
  applyShadows(g);
  return g;
}

function makePlant() {
  const g = new THREE.Group();
  const potH = 0.42;
  const pot = new THREE.Mesh(
    new THREE.CylinderGeometry(0.26, 0.2, potH, 16),
    M.ceramic
  );
  pot.position.y = potH / 2;
  g.add(pot);
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(0.26, 0.018, 8, 24),
    M.gold
  );
  rim.position.y = potH;
  rim.rotation.x = Math.PI / 2;
  g.add(rim);
  const soil = new THREE.Mesh(
    new THREE.CylinderGeometry(0.245, 0.245, 0.02, 16),
    M.soil
  );
  soil.position.y = potH - 0.005;
  g.add(soil);
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.015, 0.025, 0.55, 8),
    new THREE.MeshStandardMaterial({ color: 0x4a3a28, roughness: 0.9 })
  );
  stem.position.y = potH + 0.27;
  g.add(stem);
  const foliage = [
    { y: 0.78, x:  0.0,  z:  0.0,  r: 0.30, s: [1.2, 1.0, 1.2], m: M.leaf  },
    { y: 0.95, x: -0.18, z:  0.05, r: 0.26, s: [1.0, 0.9, 1.0], m: M.leafD },
    { y: 0.95, x:  0.18, z: -0.05, r: 0.26, s: [1.0, 0.9, 1.0], m: M.leaf  },
    { y: 1.05, x:  0.04, z:  0.18, r: 0.24, s: [1.0, 0.9, 1.0], m: M.leafD },
    { y: 1.18, x:  0.0,  z:  0.0,  r: 0.22, s: [0.95, 0.85, 0.95], m: M.leaf }
  ];
  for (const f of foliage) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(f.r, 14, 10), f.m);
    leaf.scale.set(...f.s);
    leaf.position.set(f.x, f.y, f.z);
    g.add(leaf);
  }
  applyShadows(g);
  return g;
}

const FURNITURE_BUILD = {
  bookshelf: makeBookshelf,
  desk:      makeDesk,
  sofa:      makeSofa,
  plant:     makePlant
};

// Furniture state
const placedFurniture = [];
const furnitureMap = new Map(); // "ix,iz" -> root group

let ghost = null;
let ghostRotation = 0;

const mouseNDC = new THREE.Vector2(-2, -2);
let mouseOverCanvas = false;
canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  mouseNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mouseNDC.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  mouseOverCanvas = true;
});
canvas.addEventListener('mouseleave', () => { mouseOverCanvas = false; });
canvas.addEventListener('mouseenter', () => { mouseOverCanvas = true; });

function ensureGhost(type) {
  if (ghost && ghost.userData.type === type) return ghost;
  if (ghost) scene.remove(ghost);
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

function buildAimedFurniture() {
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

function placeFurniture() {
  if (!selectedFurniture || !ghost || !ghost.visible) return;
  const ix = Math.round(ghost.position.x / TILE);
  const iz = Math.round(ghost.position.z / TILE);
  const key = `${ix},${iz}`;
  if (furnitureMap.has(key)) return;

  const g = FURNITURE_BUILD[selectedFurniture]();
  g.position.set(ix * TILE, 0, iz * TILE);
  g.rotation.y = ghostRotation;
  g.userData = { isFurniture: true, type: selectedFurniture, key };
  scene.add(g);
  placedFurniture.push(g);
  furnitureMap.set(key, g);
}

function removeFurniture() {
  const obj = buildAimedFurniture();
  if (!obj) return;
  scene.remove(obj);
  furnitureMap.delete(obj.userData.key);
  const i = placedFurniture.indexOf(obj);
  if (i >= 0) placedFurniture.splice(i, 1);
  obj.traverse((c) => { if (c.isMesh && c.geometry) c.geometry.dispose(); });
}

// ---------- Click dispatch ----------
document.addEventListener('mousedown', (e) => {
  if (mode === 'walk' && controls.isLocked) {
    if (e.button === 0) placeCube();
    else if (e.button === 2) removeCube();
  } else if (mode === 'build') {
    if (e.target !== canvas) return;
    if (e.button === 0) placeFurniture();
    else if (e.button === 2) removeFurniture();
  }
});
document.addEventListener('contextmenu', (e) => e.preventDefault());

// ---------- Highlight + ghost loop ----------
function updateWalkHighlight() {
  if (!controls.isLocked) { highlight.visible = false; return; }
  const tile = aimedTile();
  if (!tile) { highlight.visible = false; return; }
  const key = `${tile.ix},${tile.iz}`;
  const occupied = tileMap.has(key);
  highlight.visible = true;
  highlight.position.set(tile.ix * TILE, 0.02, tile.iz * TILE);
  highlightMat.color.setHex(occupied ? 0xff8a8a : 0xe8d3a8);
  highlightMat.opacity = occupied ? 0.18 : 0.28;
}

function updateBuildAim() {
  if (!selectedFurniture || !mouseOverCanvas) {
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

function updateHighlight() {
  if (mode === 'walk') updateWalkHighlight();
  else                 updateBuildAim();
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
    modeKeys.textContent  = 'クリックで配置 / 右クリックで撤去 / R で回転 / B で歩行';
    if (controls.isLocked) {
      suppressPauseOverlay = true;
      controls.unlock();
    }
  } else {
    document.body.classList.remove('build-mode');
    document.body.classList.add('walk-mode');
    modeLabel.textContent = 'Walk Mode';
    modeKeys.textContent  = 'WASD移動 / Mouse視点 / 左クリックで設置 / B でビルド';
    clearGhost();
    highlight.visible = false;
    if (firstLockDone) controls.lock();
  }
}

document.querySelectorAll('.cat-item').forEach((btn) => {
  btn.addEventListener('click', () => {
    const id = btn.dataset.item;
    if (selectedFurniture === id) {
      selectedFurniture = null;
      btn.classList.remove('active');
      selectionInfo.textContent = '家具を選んでください';
      selectionInfo.classList.remove('has-selection');
      clearGhost();
      return;
    }
    selectedFurniture = id;
    ghostRotation = 0;
    document.querySelectorAll('.cat-item').forEach((b) => {
      b.classList.toggle('active', b === btn);
    });
    const name = FURNITURE_NAMES[id] ?? id;
    selectionInfo.textContent = `選択中：${name}（R で回転）`;
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
