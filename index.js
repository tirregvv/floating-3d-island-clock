import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import WeatherEngine, { mapToSceneWeather } from "./weatherEngine.js";

const prefersReducedMotion =
	typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

// =============================================
// SCENE SETUP
// =============================================
const scene = new THREE.Scene();
const isMobileDevice = /Mobi|Android|iPhone|iPad|iPod|BlackBerry|Opera Mini|IEMobile/.test(navigator.userAgent);
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 500);
camera.position.set(22, 16, 22);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = !isMobileDevice;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
const root = document.getElementById("root") ?? document.body;
root.appendChild(renderer.domElement);

const celestialShell = new THREE.Group();
celestialShell.name = "celestialShell";
scene.add(celestialShell);

const sceneFog = new THREE.FogExp2(0x05081a, 0);
scene.fog = sceneFog;

// =============================================
// ORBIT CONTROLS
// =============================================
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 10;
controls.maxDistance = 55;
controls.maxPolarAngle = Math.PI / 2.05;
controls.minPolarAngle = 0.2;
controls.target.set(0, 1, 0);
controls.update();

// =============================================
// TIME SIMULATION STATE
// =============================================
let simulatedDayFraction = null;

function getDayProgress() {
	if (simulatedDayFraction !== null) return simulatedDayFraction;
	const now = new Date();
	return (now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()) / 86400;
}

function getDisplayTime() {
	const frac = getDayProgress();
	const totalSeconds = Math.round(frac * 86400);
	const h = Math.floor(totalSeconds / 3600) % 24;
	const m = Math.floor((totalSeconds % 3600) / 60);
	const s = totalSeconds % 60;
	return { h, m, s };
}

// =============================================
// UI OVERLAY
// =============================================
const overlay = document.createElement("div");
overlay.id = "time-overlay";
overlay.innerHTML = `<div id="time-display">00:00:00</div><div id="date-display">01.01.2025</div>`;
document.body.appendChild(overlay);

const sliderUI = document.createElement("div");
sliderUI.id = "slider-ui";
sliderUI.innerHTML = `
  <label id="slider-label">TIME OF DAY</label>
  <div id="slider-row">
    <input type="range" id="time-slider" min="0" max="1440" step="1" value="720">
    <button id="reset-btn">&#8635; Reset</button>
  </div>
`;
document.body.appendChild(sliderUI);

// Weather indicator (demo cycle); countdown area resumes live Open-Meteo sync
const weatherLabel = document.createElement("button");
weatherLabel.id = "weather-label";
weatherLabel.type = "button";
weatherLabel.title = "Demo: cycle weather. Forecast: Open-Meteo (open-meteo.com)";
weatherLabel.addEventListener("click", () => {
	liveWeatherActive = false;
	lastWeather = currentWeather;
	currentWeather = pickNextWeather(currentWeather);
	weatherStartTime = performance.now();
	weatherTransition = 0;
	setWeatherLabel(currentWeather, false);
	if (lastWeather === "snowstorm" && currentWeather === "clear") snowAccumulation = 0;
});
document.body.appendChild(weatherLabel);

// Countdown
const weatherCountdown = document.createElement("div");
weatherCountdown.id = "weather-countdown";
document.body.appendChild(weatherCountdown);

const style = document.createElement("style");
style.textContent = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap');
  #time-overlay {
    position: fixed; top: 16px; left: 50%; transform: translateX(-50%);
    z-index: 100; pointer-events: none; text-align: center;
    font-family: 'Inter', sans-serif;
    background: rgba(0,0,0,0.28); backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    border: 1px solid rgba(255,255,255,0.12); border-radius: 12px;
    padding: 10px 28px; min-width: 140px;
  }
  #time-display { font-size: 28px; font-weight: 600; color: #fff; letter-spacing: 2px; line-height: 1.2; }
  #date-display { font-size: 13px; font-weight: 400; color: rgba(255,255,255,0.7); letter-spacing: 1px; margin-top: 2px; }
  #slider-ui {
    position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
    z-index: 100; font-family: 'Inter', sans-serif;
    background: rgba(0,0,0,0.38); backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid rgba(255,255,255,0.13); border-radius: 14px;
    padding: 12px 22px 14px; min-width: 320px;
    display: flex; flex-direction: column; gap: 7px; align-items: center;
  }
  #slider-label { font-size: 11px; font-weight: 600; color: rgba(255,255,255,0.5); letter-spacing: 2px; }
  #slider-row { display: flex; align-items: center; gap: 12px; width: 100%; }
  #time-slider {
    flex: 1; -webkit-appearance: none; appearance: none; height: 5px;
    border-radius: 3px; background: rgba(255,255,255,0.18); outline: none; cursor: pointer;
  }
  #time-slider::-webkit-slider-thumb {
    -webkit-appearance: none; width: 18px; height: 18px; border-radius: 50%;
    background: #7ec8e3; box-shadow: 0 0 8px rgba(126,200,227,0.8); cursor: pointer;
  }
  #time-slider::-moz-range-thumb {
    width: 18px; height: 18px; border-radius: 50%; border: none;
    background: #7ec8e3; box-shadow: 0 0 8px rgba(126,200,227,0.8); cursor: pointer;
  }
  #reset-btn {
    background: rgba(255,255,255,0.13); border: 1px solid rgba(255,255,255,0.2);
    border-radius: 8px; color: #fff; font-family: 'Inter', sans-serif;
    font-size: 13px; font-weight: 600; padding: 6px 14px; cursor: pointer;
    transition: background 0.18s; white-space: nowrap;
  }
  #reset-btn:hover { background: rgba(255,255,255,0.24); }
  #weather-label {
    position: fixed; top: 16px; right: 20px; z-index: 200;
    font-family: 'Inter', sans-serif;
    background: rgba(0,0,0,0.32); backdrop-filter: blur(10px);
    border: 1px solid rgba(255,255,255,0.12); border-radius: 10px;
    padding: 7px 16px; color: #fff; font-size: 14px; font-weight: 600;
    letter-spacing: 1px; cursor: pointer; transition: background 0.18s, transform 0.18s;
  }
  #weather-label:hover {
    background: rgba(255,255,255,0.12);
    transform: translateY(-1px);
  }
  #weather-label:focus {
    outline: 2px solid rgba(126,200,227,0.7);
    outline-offset: 2px;
  }
  #weather-label::after {
    content: '➜';
    margin-left: 10px;
    opacity: 0.75;
    font-size: 0.95em;
    vertical-align: middle;
  }
  #weather-countdown {
    position: fixed; top: 58px; right: 20px; z-index: 200;
    font-family: 'Inter', sans-serif;
    background: rgba(0,0,0,0.2); backdrop-filter: blur(8px);
    border: 1px solid rgba(255,255,255,0.08); border-radius: 8px;
    padding: 4px 12px; color: rgba(255,255,255,0.5); font-size: 11px;
    letter-spacing: 1px; cursor: pointer;
  }
  #weather-countdown:hover { color: rgba(255,255,255,0.75); }
  @media (max-width: 640px) {
    #time-overlay {
      left: 12px; right: 12px; transform: none;
      min-width: auto; width: calc(100% - 24px);
      padding: 10px 14px;
      top: calc(12px + env(safe-area-inset-top, 0));
    }
    #time-display { font-size: 22px; }
    #date-display { font-size: 12px; }
    #slider-ui {
      min-width: auto; width: calc(100% - 24px);
      bottom: calc(12px + env(safe-area-inset-bottom, 0)); padding: 10px 14px 12px;
    }
    #slider-row { flex-direction: column; align-items: stretch; }
    #reset-btn { width: 100%; margin-top: 10px; }
    #weather-label {
      top: auto; bottom: calc(190px + env(safe-area-inset-bottom, 0));
      right: 12px; left: auto;
      transform: none; max-width: calc(100% - 24px);
      white-space: normal;
    }
    #weather-countdown {
      top: auto; bottom: calc(152px + env(safe-area-inset-bottom, 0));
      right: 12px; left: auto;
      width: auto;
    }
  }
  body { margin: 0; overflow: hidden; }
`;
document.head.appendChild(style);

const timeSlider = document.getElementById("time-slider");
const resetBtn = document.getElementById("reset-btn");

function syncSliderToRealTime() {
	const now = new Date();
	timeSlider.value = now.getHours() * 60 + now.getMinutes();
	simulatedDayFraction = null;
}
syncSliderToRealTime();
timeSlider.addEventListener("input", () => {
	simulatedDayFraction = parseInt(timeSlider.value) / 1440;
});
resetBtn.addEventListener("click", syncSliderToRealTime);

function updateTimeUI() {
	const { h, m, s } = getDisplayTime();
	const pad = (n) => String(n).padStart(2, "0");
	document.getElementById("time-display").textContent = `${pad(h)}:${pad(m)}:${pad(s)}`;
	const now = new Date();
	document.getElementById("date-display").textContent = `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()}`;
	if (simulatedDayFraction === null) timeSlider.value = now.getHours() * 60 + now.getMinutes();
}
setInterval(updateTimeUI, 1000);
updateTimeUI();

// =============================================
// MATERIALS
// =============================================
const grassMat = new THREE.MeshLambertMaterial({ color: 0x6abf4b });
const dirt1Mat = new THREE.MeshLambertMaterial({ color: 0x8b6b4a });
const dirt2Mat = new THREE.MeshLambertMaterial({ color: 0x735839 });
const dirt3Mat = new THREE.MeshLambertMaterial({ color: 0x5c4530 });
const stoneMat = new THREE.MeshLambertMaterial({ color: 0x7a7a7a });
const stoneMat2 = new THREE.MeshLambertMaterial({ color: 0x5e5e5e });
const woodMat = new THREE.MeshLambertMaterial({ color: 0x8b6839 });
const roofMat = new THREE.MeshLambertMaterial({ color: 0xa0522d });
const doorMat = new THREE.MeshLambertMaterial({ color: 0x5c3a1e });
const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6b4226 });
const leavesMat = new THREE.MeshLambertMaterial({ color: 0x3d8b37 });
const leavesMat2 = new THREE.MeshLambertMaterial({ color: 0x4ea843 });
const rockMat = new THREE.MeshLambertMaterial({ color: 0x8a8a8a });
const rockMat2 = new THREE.MeshLambertMaterial({ color: 0x6e6e6e });
const flowerStemMat = new THREE.MeshLambertMaterial({ color: 0x3a7d32 });
const flowerPetalMats = [new THREE.MeshLambertMaterial({ color: 0xff6b8a }), new THREE.MeshLambertMaterial({ color: 0xffd93d }), new THREE.MeshLambertMaterial({ color: 0xae7cff }), new THREE.MeshLambertMaterial({ color: 0xff9f43 }), new THREE.MeshLambertMaterial({ color: 0x74b9ff })];
const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
const windowMat = new THREE.MeshLambertMaterial({ color: 0xc8e6ff, emissive: 0x445566, emissiveIntensity: 0.2 });
const lanternGlowMat = new THREE.MeshLambertMaterial({ color: 0xffdd88, emissive: 0xffaa33, emissiveIntensity: 0.3 });
const snowMat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xc8e8ff, emissiveIntensity: 0.2, transparent: true, opacity: 0.95 });
const treeSnowMaterials = [];
let cabinSnowMaterial = null;

// =============================================
// ISLAND GROUP
// =============================================
const islandGroup = new THREE.Group();
islandGroup.name = "islandGroup";
scene.add(islandGroup);

// =============================================
// TERRAIN
// =============================================
const GRID_SIZE = 19;
const TILE_SIZE = 1.0;
const GAP = 0.07;
const TILE_ACTUAL = TILE_SIZE - GAP;
const CENTER = (GRID_SIZE - 1) / 2;
const ISLAND_RADIUS = 9.2;

function createRoundedBox(w, h, d, r, s) {
	const shape = new THREE.Shape();
	const x = -w / 2,
		y = -h / 2;
	shape.moveTo(x + r, y);
	shape.lineTo(x + w - r, y);
	shape.quadraticCurveTo(x + w, y, x + w, y + r);
	shape.lineTo(x + w, y + h - r);
	shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
	shape.lineTo(x + r, y + h);
	shape.quadraticCurveTo(x, y + h, x, y + h - r);
	shape.lineTo(x, y + r);
	shape.quadraticCurveTo(x, y, x + r, y);
	const geo = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: true, bevelThickness: r * 0.35, bevelSize: r * 0.35, bevelSegments: s });
	geo.translate(0, 0, -d / 2);
	geo.rotateX(-Math.PI / 2);
	return geo;
}

const grassGeo = createRoundedBox(TILE_ACTUAL, TILE_ACTUAL, 0.22, 0.12, 3);
const dirt1Geo = createRoundedBox(TILE_ACTUAL * 0.95, TILE_ACTUAL * 0.95, 0.38, 0.09, 2);
const dirt2Geo = createRoundedBox(TILE_ACTUAL * 0.88, TILE_ACTUAL * 0.88, 0.45, 0.07, 2);
const dirt3Geo = createRoundedBox(TILE_ACTUAL * 0.8, TILE_ACTUAL * 0.8, 0.55, 0.07, 2);
const stone1Geo = createRoundedBox(TILE_ACTUAL * 0.72, TILE_ACTUAL * 0.72, 0.6, 0.06, 1);
const stone2Geo = createRoundedBox(TILE_ACTUAL * 0.62, TILE_ACTUAL * 0.62, 0.7, 0.05, 1);

function seededRandom(seed) {
	let s = seed;
	return function () {
		s = (s * 16807) % 2147483647;
		return (s - 1) / 2147483646;
	};
}
const rng = seededRandom(42);
const tilePositions = [];

for (let row = 0; row < GRID_SIZE; row++) {
	for (let col = 0; col < GRID_SIZE; col++) {
		const dx = col - CENTER,
			dz = row - CENTER;
		const dist = Math.sqrt(dx * dx + dz * dz);
		const normDist = dist / (ISLAND_RADIUS / TILE_SIZE);
		if (normDist > 1.0) continue;
		const heightOffset = Math.cos(normDist * Math.PI * 0.5) * 2.4 + rng() * 0.12;
		const px = dx * TILE_SIZE,
			pz = dz * TILE_SIZE,
			py = heightOffset;
		const depthFactor = 1 - normDist;
		const tileGroup = new THREE.Group();
		tileGroup.position.set(px, py, pz);
		const grassMesh = new THREE.Mesh(grassGeo, grassMat);
		grassMesh.castShadow = true;
		grassMesh.receiveShadow = true;
		tileGroup.add(grassMesh);
		const d1 = new THREE.Mesh(dirt1Geo, dirt1Mat);
		d1.position.y = -0.33;
		tileGroup.add(d1);
		const d2 = new THREE.Mesh(dirt2Geo, dirt2Mat);
		d2.position.y = -0.75;
		tileGroup.add(d2);
		const d3 = new THREE.Mesh(dirt3Geo, dirt3Mat);
		d3.position.y = -1.25;
		tileGroup.add(d3);
		if (depthFactor > 0.35) {
			const s1 = new THREE.Mesh(stone1Geo, stoneMat);
			s1.position.y = -1.82;
			tileGroup.add(s1);
		}
		if (depthFactor > 0.6) {
			const s2 = new THREE.Mesh(stone2Geo, stoneMat2);
			s2.position.y = -2.48;
			tileGroup.add(s2);
		}
		islandGroup.add(tileGroup);
		tilePositions.push({ x: px, y: py, z: pz, dist: normDist });
	}
}

// =============================================
// CABIN
// =============================================
const cabinGroup = new THREE.Group();
const centerTile = tilePositions.reduce((best, t) => (Math.hypot(t.x, t.z) < Math.hypot(best.x, best.z) ? t : best), tilePositions[0]);

const cabinBody = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.1, 1.3), woodMat);
cabinBody.position.y = 0.55;
cabinBody.castShadow = true;
cabinBody.receiveShadow = true;
cabinGroup.add(cabinBody);
const roofMesh = new THREE.Mesh(new THREE.ConeGeometry(1.25, 0.8, 4), roofMat);
roofMesh.position.y = 1.5;
roofMesh.rotation.y = Math.PI / 4;
roofMesh.castShadow = true;
cabinGroup.add(roofMesh);
cabinSnowMaterial = snowMat.clone();
cabinSnowMaterial.opacity = 0;
const snowRoof = new THREE.Mesh(new THREE.ConeGeometry(1.28, 0.18, 4), cabinSnowMaterial);
snowRoof.position.y = 1.43;
snowRoof.rotation.y = Math.PI / 4;
snowRoof.castShadow = false;
cabinGroup.add(snowRoof);
const door = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.55, 0.05), doorMat);
door.position.set(0, 0.35, 0.68);
cabinGroup.add(door);
const win1 = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 0.05), windowMat);
win1.position.set(-0.45, 0.65, 0.68);
cabinGroup.add(win1);
const win2 = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 0.05), windowMat);
win2.position.set(0.45, 0.65, 0.68);
cabinGroup.add(win2);
const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.5, 0.22), rockMat);
chimney.position.set(0.45, 1.85, -0.2);
chimney.castShadow = true;
cabinGroup.add(chimney);
const lanternPost = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.55, 5), woodMat);
lanternPost.position.set(0, 0.6, 0.82);
cabinGroup.add(lanternPost);
const lanternBox = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.18, 0.15), lanternGlowMat);
lanternBox.name = "lanternBox";
lanternBox.position.set(0, 0.92, 0.82);
cabinGroup.add(lanternBox);
const cabinLight = new THREE.PointLight(0xffaa33, 0.0, 6.0);
cabinLight.castShadow = true;
cabinLight.shadow.mapSize.set(512, 512);
cabinLight.position.set(0, 0.95, 0.82);
cabinGroup.add(cabinLight);

cabinGroup.position.set(centerTile.x, centerTile.y + 0.12, centerTile.z);
cabinGroup.scale.setScalar(0.85);
islandGroup.add(cabinGroup);

// =============================================
// TREES
// =============================================
function createTree(x, y, z, scale) {
	const tree = new THREE.Group();
	const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.8, 5), trunkMat);
	trunk.position.y = 0.4;
	trunk.castShadow = true;
	tree.add(trunk);
	const mat = rng() > 0.5 ? leavesMat : leavesMat2;
	[
		[0.55, 0.7, 1.1],
		[0.42, 0.6, 1.55],
		[0.28, 0.45, 1.9],
	].forEach(([r, h, py], idx) => {
		const f = new THREE.Mesh(new THREE.ConeGeometry(r, h, 6), mat);
		f.position.y = py;
		f.castShadow = true;
		tree.add(f);
		const snowCapMaterial = snowMat.clone();
		snowCapMaterial.opacity = 0;
		const snowCap = new THREE.Mesh(new THREE.ConeGeometry(r * 0.78, Math.max(0.12, h * 0.18), 6), snowCapMaterial);
		snowCap.position.y = py + 0.12;
		snowCap.rotation.y = Math.random() * Math.PI * 2;
		snowCap.castShadow = false;
		tree.add(snowCap);
		treeSnowMaterials.push(snowCapMaterial);
	});
	tree.position.set(x, y + 0.1, z);
	tree.scale.setScalar(scale);
	tree.rotation.y = rng() * Math.PI * 2;
	return tree;
}

const treeMeshes = [];
for (let i = 0; i < 28; i++) {
	const tile = tilePositions[Math.floor(rng() * tilePositions.length)];
	if (tile.dist < 0.1) continue;
	const t = createTree(tile.x + (rng() - 0.5) * 0.3, tile.y, tile.z + (rng() - 0.5) * 0.3, 0.6 + rng() * 0.7);
	islandGroup.add(t);
	treeMeshes.push(t);
}

// =============================================
// ROCKS
// =============================================
for (let i = 0; i < 35; i++) {
	const tile = tilePositions[Math.floor(rng() * tilePositions.length)];
	if (tile.dist < 0.12) continue;
	const geo = new THREE.DodecahedronGeometry(0.12 + rng() * 0.15, 0);
	const mat = rng() > 0.5 ? rockMat : rockMat2;
	const rock = new THREE.Mesh(geo, mat);
	rock.position.set(tile.x + (rng() - 0.5) * 0.4, tile.y + 0.12, tile.z + (rng() - 0.5) * 0.4);
	rock.rotation.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
	rock.scale.set(1 + rng() * 0.5, 0.6 + rng() * 0.4, 1 + rng() * 0.5);
	rock.castShadow = true;
	rock.receiveShadow = true;
	islandGroup.add(rock);
}

// =============================================
// FLOWERS
// =============================================
for (let i = 0; i < 55; i++) {
	const tile = tilePositions[Math.floor(rng() * tilePositions.length)];
	if (tile.dist < 0.1) continue;
	const flower = new THREE.Group();
	const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.2, 3), flowerStemMat);
	stem.position.y = 0.1;
	flower.add(stem);
	const petal = new THREE.Mesh(new THREE.SphereGeometry(0.06, 5, 4), flowerPetalMats[Math.floor(rng() * flowerPetalMats.length)]);
	petal.position.y = 0.22;
	petal.scale.y = 0.5;
	flower.add(petal);
	flower.position.set(tile.x + (rng() - 0.5) * 0.5, tile.y + 0.08, tile.z + (rng() - 0.5) * 0.5);
	flower.scale.setScalar(0.7 + rng() * 0.6);
	flower.rotation.y = rng() * Math.PI * 2;
	islandGroup.add(flower);
}

// =============================================
// CLOUDS (base set)
// =============================================
const clouds = [];
for (let i = 0; i < 10; i++) {
	const cloud = new THREE.Group();
	const count = 4 + Math.floor(rng() * 4);
	for (let j = 0; j < count; j++) {
		const puff = new THREE.Mesh(new THREE.SphereGeometry(0.4 + rng() * 0.5, 7, 6), cloudMat);
		puff.position.set((rng() - 0.5) * 1.5, (rng() - 0.5) * 0.3, (rng() - 0.5) * 0.8);
		puff.scale.y = 0.5 + rng() * 0.3;
		cloud.add(puff);
	}
	cloud.position.set((rng() - 0.5) * 28, 7 + rng() * 4, (rng() - 0.5) * 28);
	cloud.userData.speed = 0.15 + rng() * 0.25;
	cloud.userData.startX = cloud.position.x;
	cloud.userData.startZ = cloud.position.z;
	clouds.push(cloud);
	scene.add(cloud);
}

// =============================================
// MOON (phases: sun direction + earthshine, subtle twinkle on dark side)
// =============================================
const moonShaderUniforms = {
	sunWorldPos: { value: new THREE.Vector3(1, 0, 0) },
	cameraWorldPos: { value: new THREE.Vector3() },
	uTime: { value: 0 },
	moonBrightness: { value: 1 },
};
const moonMat = new THREE.ShaderMaterial({
	uniforms: moonShaderUniforms,
	vertexShader: `
		varying vec3 vWorldNormal;
		varying vec3 vWorldPos;
		void main() {
			vWorldNormal = normalize(mat3(modelMatrix) * normal);
			vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
			gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
		}
	`,
	fragmentShader: `
		uniform vec3 sunWorldPos;
		uniform vec3 cameraWorldPos;
		uniform float uTime;
		uniform float moonBrightness;
		varying vec3 vWorldNormal;
		varying vec3 vWorldPos;
		void main() {
			vec3 N = normalize(vWorldNormal);
			vec3 L = normalize(sunWorldPos - vWorldPos);
			vec3 V = normalize(cameraWorldPos - vWorldPos);
			float ndotl = dot(N, L);
			float lit = smoothstep(-0.06, 0.1, ndotl);
			float facing = max(0.0, dot(N, V));
			vec3 litCol = vec3(0.88, 0.92, 1.0) * (0.12 + 0.88 * lit) * moonBrightness;
			vec3 earth = vec3(0.12, 0.14, 0.2) * moonBrightness;
			vec3 col = mix(earth, litCol, lit);
			col = mix(vec3(0.02,0.03, 0.06), col, facing);
			float tw = 0.035 * sin(uTime * 1.2 + vWorldPos.x * 3.5 + vWorldPos.y * 2.1);
			col += tw * (1.0 - lit) * facing;
			gl_FragColor = vec4(col, 1.0);
		}
	`,
});
const moonMesh = new THREE.Mesh(new THREE.SphereGeometry(1.8, 32, 32), moonMat);
moonMesh.name = "moon";
scene.add(moonMesh);
const moonLight = new THREE.DirectionalLight(0x4466dd, 0.0);
moonLight.castShadow = true;
moonLight.shadow.mapSize.set(1024, 1024);
moonLight.shadow.camera.left = -16;
moonLight.shadow.camera.right = 16;
moonLight.shadow.camera.top = 16;
moonLight.shadow.camera.bottom = -16;
moonLight.shadow.camera.near = 1;
moonLight.shadow.camera.far = 55;
moonLight.shadow.bias = -0.001;
scene.add(moonLight);

// =============================================
// SUN
// =============================================
const sunMat = new THREE.MeshBasicMaterial({ color: 0xfff5e0, opacity: 0.95, transparent: true });
const sunMesh = new THREE.Mesh(new THREE.SphereGeometry(1.6, 24, 24), sunMat);
sunMesh.name = "sun";
scene.add(sunMesh);

// =============================================
// LIGHTING
// =============================================
const ambientLight = new THREE.AmbientLight(0x8899bb, isMobileDevice ? 0.55 : 0.4);
scene.add(ambientLight);
const sunLight = new THREE.DirectionalLight(0xffeedd, 1.2);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.camera.left = -15;
sunLight.shadow.camera.right = 15;
sunLight.shadow.camera.top = 15;
sunLight.shadow.camera.bottom = -15;
sunLight.shadow.camera.near = 0.5;
sunLight.shadow.camera.far = 55;
sunLight.shadow.bias = -0.001;
sunLight.shadow.normalBias = 0.02;
if (isMobileDevice) sunLight.castShadow = false;
scene.add(sunLight);
const hemisphereLight = new THREE.HemisphereLight(0x87ceeb, 0x5c4530, isMobileDevice ? 0.4 : 0.3);
scene.add(hemisphereLight);

const dayTop = new THREE.Color(0x87ceeb),
	dayBot = new THREE.Color(0xb8d8f0);
const sunsetTop = new THREE.Color(0xff7744),
	sunsetBot = new THREE.Color(0xffaa55);
const nightTop = new THREE.Color(0x05081a),
	nightBot = new THREE.Color(0x0d1133);
const daySunCol = new THREE.Color(0xfff5e0),
	sunsetSunCol = new THREE.Color(0xff8844),
	nightSunCol = new THREE.Color(0x334488);

// Stars
const starCount = 700;
const starGeo = new THREE.BufferGeometry();
const starPos = new Float32Array(starCount * 3);
for (let i = 0; i < starCount; i++) {
	const theta = rng() * Math.PI * 2,
		phi = rng() * Math.PI,
		r = 120 + rng() * 80;
	starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
	starPos[i * 3 + 1] = Math.abs(r * Math.cos(phi)) * 0.6 + 20;
	starPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
}
starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.45, sizeAttenuation: true, transparent: true, opacity: 0 });
const starPoints = new THREE.Points(starGeo, starMat);
celestialShell.add(starPoints);

const fallingStars = [];
let nextFallingStarTime = performance.now() + 7000 + Math.random() * 6000;
const cometDir = new THREE.Vector3();
const cometQuat = new THREE.Quaternion();
function createFallingStar() {
	const comet = new THREE.Group();
	const headMat = new THREE.MeshBasicMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1 });
	const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), headMat);
	comet.add(head);

	const tailGeo = new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(new Float32Array([0, 0, 0, -1.1, -0.18, 0]), 3));
	const tail = new THREE.Line(tailGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }));
	comet.add(tail);

	const startX = (Math.random() > 0.5 ? -1 : 1) * (24 + Math.random() * 14);
	const startY = 14 + Math.random() * 9;
	const startZ = (Math.random() - 0.5) * 22;
	const endX = -Math.sign(startX) * (20 + Math.random() * 8);
	const endY = 4 + Math.random() * 5;
	const endZ = startZ + (Math.random() - 0.5) * 12;
	const duration = 1.2 + Math.random() * 1.2;

	comet.position.set(startX, startY, startZ);
	comet.userData.velocity = new THREE.Vector3((endX - startX) / duration, (endY - startY) / duration, (endZ - startZ) / duration);
	comet.userData.life = duration;
	comet.userData.age = 0;

	cometDir.copy(comet.userData.velocity).normalize();
	cometQuat.setFromUnitVectors(new THREE.Vector3(1, 0, 0), cometDir);
	comet.setRotationFromQuaternion(cometQuat);

	scene.add(comet);
	fallingStars.push(comet);
}

function updateFallingStars(dt) {
	const now = performance.now();
	if (now >= nextFallingStarTime) {
		createFallingStar();
		nextFallingStarTime = now + 7000 + Math.random() * 7000;
	}
	for (let i = fallingStars.length - 1; i >= 0; i--) {
		const comet = fallingStars[i];
		comet.userData.age += dt;
		comet.position.x += comet.userData.velocity.x * dt;
		comet.position.y += comet.userData.velocity.y * dt;
		comet.position.z += comet.userData.velocity.z * dt;
		const fade = Math.max(0, 1 - comet.userData.age / comet.userData.life);
		comet.children.forEach((child) => {
			if (child.material) child.material.opacity = fade * 0.9;
		});
		if (comet.userData.age >= comet.userData.life) {
			scene.remove(comet);
			fallingStars.splice(i, 1);
		}
	}
}

// =============================================
// SOLAR — declination from calendar date; hour from getDayProgress()
// =============================================
let observerLatitudeRad = (45 / 180) * Math.PI;

function declinationRadFromDate(date) {
	const start = new Date(date.getFullYear(), 0, 0);
	const dayOfYear = Math.floor((date - start) / 86400000);
	return ((23.45 * Math.PI) / 180) * Math.sin((2 * Math.PI * (284 + dayOfYear)) / 365);
}

function bodyAzEl(latRad, declRad, hourAngle) {
	const sinElev =
		Math.sin(latRad) * Math.sin(declRad) + Math.cos(latRad) * Math.cos(declRad) * Math.cos(hourAngle);
	const elev = Math.asin(THREE.MathUtils.clamp(sinElev, -1, 1));
	const cosElev = Math.cos(elev);
	const denom = Math.max(0.001, cosElev);
	const sinAz = (-Math.sin(hourAngle) * Math.cos(declRad)) / denom;
	const cosAz =
		(Math.sin(declRad) * Math.cos(latRad) - Math.cos(declRad) * Math.sin(latRad) * Math.cos(hourAngle)) / denom;
	const az = Math.atan2(sinAz, cosAz);
	return { elev, az };
}

function skyPositionFromAzEl(az, elev, radius, zBias) {
	const ce = Math.cos(elev),
		se = Math.sin(elev);
	return {
		x: radius * ce * Math.sin(az),
		y: radius * se,
		z: radius * ce * Math.cos(az) + zBias,
	};
}

const _sunWorldVec = new THREE.Vector3();

// =============================================
// DAY/NIGHT — seasonal sun, baselines for weather (no compounding dim)
// =============================================
function updateDayNightCycle() {
	const t = getDayProgress();
	const omega = (t - 0.5) * Math.PI * 2;
	const declRad = declinationRadFromDate(new Date());
	const latRad = observerLatitudeRad;

	const sunAe = bodyAzEl(latRad, declRad, omega);
	const moonAe = bodyAzEl(latRad, declRad, omega + Math.PI);
	const sunDist = 24;
	const zBias = 7;

	const sunP = skyPositionFromAzEl(sunAe.az, sunAe.elev, sunDist, zBias);
	const moonP = skyPositionFromAzEl(moonAe.az, moonAe.elev, sunDist, zBias);

	sunLight.position.set(sunP.x, sunP.y, sunP.z);
	sunLight.target.position.set(0, 0, 0);
	sunMesh.position.set(sunP.x, sunP.y, sunP.z);
	sunMesh.visible = sunP.y > -1.5;

	moonMesh.position.set(moonP.x, moonP.y, moonP.z);
	moonLight.position.set(moonP.x, moonP.y, moonP.z);
	moonLight.target.position.set(0, 0, 0);

	_sunWorldVec.set(sunP.x, sunP.y, sunP.z);
	moonShaderUniforms.sunWorldPos.value.copy(_sunWorldVec);
	moonShaderUniforms.cameraWorldPos.value.copy(camera.position);

	const aboveness = Math.sin(sunAe.elev);
	let skyTop, skyBot, sunCol, intensity, ambInt, starOp;

	if (aboveness > 0.15) {
		const d = Math.min((aboveness - 0.15) / 0.3, 1);
		skyTop = sunsetTop.clone().lerp(dayTop, d);
		skyBot = sunsetBot.clone().lerp(dayBot, d);
		sunCol = sunsetSunCol.clone().lerp(daySunCol, d);
		intensity = 0.8 + d * 0.7;
		ambInt = 0.35 + d * 0.25;
		starOp = 0;
	} else if (aboveness > -0.15) {
		const d = (aboveness + 0.15) / 0.3;
		skyTop = nightTop.clone().lerp(sunsetTop, d);
		skyBot = nightBot.clone().lerp(sunsetBot, d);
		sunCol = nightSunCol.clone().lerp(sunsetSunCol, d);
		intensity = 0.15 + d * 0.65;
		ambInt = 0.15 + d * 0.2;
		starOp = 1 - d;
	} else {
		skyTop = nightTop.clone();
		skyBot = nightBot.clone();
		sunCol = nightSunCol.clone();
		intensity = 0.08;
		ambInt = 0.12;
		starOp = 1;
	}

	scene.background = skyTop.clone();
	sunLight.color.copy(sunCol);
	sunMat.color.copy(sunCol);
	ambientLight.color.copy(skyBot);
	hemisphereLight.color.copy(skyTop);
	hemisphereLight.groundColor.copy(skyBot);

	const starTwinkle = prefersReducedMotion ? 0 : 0.04 * Math.sin(performance.now() * 0.0021);
	starMat.opacity = Math.min(0.95, starOp * 0.85 + starOp * starTwinkle);

	const moonAbove = -aboveness;
	const moonFactor = Math.max(0, Math.min(1, moonAbove / 0.2));
	moonMesh.visible = moonP.y > -3;
	moonShaderUniforms.moonBrightness.value = 0.35 + moonFactor * 0.95;
	moonLight.intensity = moonFactor * 0.5;

	const nightFactor = Math.max(0, 1 - (aboveness + 0.15) / 0.3);
	windowMat.emissiveIntensity = 0.1 + nightFactor * 1.5;
	windowMat.emissive.setHex(nightFactor > 0.3 ? 0xffaa44 : 0x445566);
	cabinLight.intensity = nightFactor * 1.8;
	lanternGlowMat.emissiveIntensity = 0.2 + nightFactor * 2.0;

	celestialShell.rotation.set(
		-latRad * 0.38 - declRad * 0.15,
		-omega,
		0,
		"YXZ",
	);

	const baselines = {
		sunIntensity: intensity,
		ambientIntensity: ambInt,
		hemisphereIntensity: ambInt * 0.8,
		sunColor: sunCol.clone(),
		skyTop: skyTop.clone(),
		skyBot: skyBot.clone(),
	};

	return { skyTop, aboveness, baselines, sunAe, omega, declRad };
}

// ============================================================
// WEATHER SYSTEM
// ============================================================
const WEATHER_DURATION_MS = 5 * 60 * 1000;
const WEATHER_ICONS = { clear: "☀️", cloudy: "☁️", rain: "🌧️", windy: "🌬️", thunderstorm: "⛈️", snowstorm: "❄️" };

let currentWeather = "clear";
let lastWeather = null;
let weatherStartTime = performance.now();
let weatherTransition = 1.0; // 0→1 over 8s

function pickNextWeather(prev) {
	if (prev === "snowstorm") return "clear";
	const t = getDayProgress();
	const isNight = t < 0.22 || t > 0.78;
	const weights = { clear: 20, cloudy: 18, rain: 15, windy: 15, thunderstorm: isNight ? 22 : 5, snowstorm: 10 };
	weights[prev] = 0;
	const total = Object.values(weights).reduce((a, b) => a + b, 0);
	let rand = Math.random() * total;
	for (const [w, wt] of Object.entries(weights)) {
		rand -= wt;
		if (rand <= 0) return w;
	}
	return "clear";
}

let liveWeatherActive = true;

function setWeatherLabel(w, live) {
	const mode = live !== false && liveWeatherActive ? "Live" : "Demo";
	weatherLabel.textContent = `${WEATHER_ICONS[w]} ${w.charAt(0).toUpperCase() + w.slice(1)} · ${mode}`;
}
let latestApiEnv = null;
let weatherEngine = null;
const smoothedWx = {
	cloudDensity: 0,
	fogDensity: 0,
	precipIntensity: 0,
	thunderActivity: 0,
	windStrength: 0,
	windDriftX: 0,
	windDriftZ: 0,
};

function proceduralSceneTargets() {
	const w = currentWeather;
	switch (w) {
		case "thunderstorm":
			return { cloudDensity: 0.9, fogDensity: 0.12, precipIntensity: 0.85, thunderActivity: 0.9, windStrength: 0.55 };
		case "rain":
			return { cloudDensity: 0.55, fogDensity: 0.08, precipIntensity: 0.65, thunderActivity: 0.15, windStrength: 0.25 };
		case "snowstorm":
			return { cloudDensity: 0.75, fogDensity: 0.15, precipIntensity: 0.8, thunderActivity: 0.05, windStrength: 0.35 };
		case "cloudy":
			return { cloudDensity: 0.72, fogDensity: 0.04, precipIntensity: 0, thunderActivity: 0, windStrength: 0.12 };
		case "windy":
			return { cloudDensity: 0.35, fogDensity: 0.02, precipIntensity: 0, thunderActivity: 0, windStrength: 0.85 };
		default:
			return { cloudDensity: 0.15, fogDensity: 0, precipIntensity: 0, thunderActivity: 0, windStrength: 0.08 };
	}
}

function smoothToward(smoothed, target, dt, rate = 2.2) {
	const k = 1 - Math.exp(-rate * dt);
	for (const key of Object.keys(target)) {
		smoothed[key] += (target[key] - smoothed[key]) * k;
	}
}

const windClamp = 28;
function windDriftXZ(dt) {
	const sx = THREE.MathUtils.clamp(smoothedWx.windDriftX, -windClamp, windClamp);
	const sz = THREE.MathUtils.clamp(smoothedWx.windDriftZ, -windClamp, windClamp);
	return { x: sx * dt * 0.11, z: sz * dt * 0.09 };
}

setWeatherLabel(currentWeather, liveWeatherActive);

weatherCountdown.addEventListener("click", () => {
	liveWeatherActive = true;
	if (latestApiEnv) {
		const m = mapToSceneWeather(latestApiEnv);
		currentWeather = m.category;
		setWeatherLabel(currentWeather, true);
	} else {
		setWeatherLabel(currentWeather, true);
	}
	weatherStartTime = performance.now();
	weatherTransition = 1;
});

// --- Extra clouds (storm/cloudy) ---
const stormCloudMats = [];
const stormClouds = [];
for (let i = 0; i < 16; i++) {
	const cloud = new THREE.Group();
	const count = 5 + Math.floor(Math.random() * 5);
	for (let j = 0; j < count; j++) {
		const mat = new THREE.MeshLambertMaterial({ color: 0x888899, transparent: true, opacity: 0 });
		stormCloudMats.push(mat);
		const puff = new THREE.Mesh(new THREE.SphereGeometry(0.5 + Math.random() * 0.6, 7, 6), mat);
		puff.position.set((Math.random() - 0.5) * 2.2, (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 1.2);
		puff.scale.y = 0.45 + Math.random() * 0.3;
		cloud.add(puff);
	}
	cloud.position.set((Math.random() - 0.5) * 32, 4 + Math.random() * 3.5, (Math.random() - 0.5) * 32);
	cloud.userData.speed = 0.18 + Math.random() * 0.28;
	cloud.userData.baseX = cloud.position.x;
	cloud.userData.baseZ = cloud.position.z;
	scene.add(cloud);
	stormClouds.push(cloud);
}

// --- Rain drops ---
const rainMat = new THREE.LineBasicMaterial({ color: 0x88aacc, transparent: true, opacity: 0.5 });
const rainDrops = [];
for (let i = 0; i < 350; i++) {
	const geo = new THREE.BufferGeometry();
	geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array([0, 0, 0, 0, -0.38, 0]), 3));
	const line = new THREE.Line(geo, rainMat.clone());
	line.userData.vy = -20 - Math.random() * 8;
	line.userData.vx = (Math.random() - 0.5) * 1.5;
	line.userData.vz = (Math.random() - 0.5) * 1.5;
	line.position.set((Math.random() - 0.5) * 30, 14 + Math.random() * 8, (Math.random() - 0.5) * 30);
	line.visible = false;
	scene.add(line);
	rainDrops.push(line);
}

// --- Puddles (in islandGroup so they rotate with island) ---
const puddleMeshes = [];
for (let i = 0; i < 45; i++) {
	const tile = tilePositions[Math.floor(Math.random() * tilePositions.length)];
	const mat = new THREE.MeshBasicMaterial({ color: 0x5577aa, transparent: true, opacity: 0, side: THREE.DoubleSide });
	const mesh = new THREE.Mesh(new THREE.CircleGeometry(0.1 + Math.random() * 0.2, 8), mat);
	mesh.rotation.x = -Math.PI / 2;
	mesh.position.set(tile.x + (Math.random() - 0.5) * 0.3, tile.y + 0.125, tile.z + (Math.random() - 0.5) * 0.3);
	mesh.visible = false;
	islandGroup.add(mesh);
	puddleMeshes.push({ mesh, mat, phase: Math.random() * Math.PI * 2 });
}

// --- Leaf particles ---
const leafMats = [
	new THREE.MeshBasicMaterial({ color: 0x4ea843, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }),
	new THREE.MeshBasicMaterial({ color: 0xd4a84b, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }),
	new THREE.MeshBasicMaterial({ color: 0xc05a2a, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }),
];
const leafParticles = [];
for (let i = 0; i < 130; i++) {
	const mat = leafMats[i % leafMats.length];
	const leaf = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.08), mat);
	leaf.userData.vx = (Math.random() - 0.5) * 5 + 3;
	leaf.userData.vy = -1.2 - Math.random() * 1.8;
	leaf.userData.vz = (Math.random() - 0.5) * 4;
	leaf.userData.spin = (Math.random() - 0.5) * 7;
	leaf.userData.wobble = Math.random() * Math.PI * 2;
	leaf.position.set((Math.random() - 0.5) * 26, 9 + Math.random() * 5, (Math.random() - 0.5) * 26);
	leaf.visible = false;
	scene.add(leaf);
	leafParticles.push(leaf);
}

// --- Snowflakes ---
const snowMat2 = new THREE.MeshBasicMaterial({ color: 0xddeeff, transparent: true, opacity: 0.85 });
const snowFlakes = [];
for (let i = 0; i < 400; i++) {
	const flake = new THREE.Mesh(new THREE.SphereGeometry(0.04 + Math.random() * 0.04, 4, 4), snowMat2.clone());
	flake.userData.vx = (Math.random() - 0.5) * 2;
	flake.userData.vy = -2.5 - Math.random() * 2;
	flake.userData.vz = (Math.random() - 0.5) * 2;
	flake.userData.wobble = Math.random() * Math.PI * 2;
	flake.position.set((Math.random() - 0.5) * 28, 14 + Math.random() * 8, (Math.random() - 0.5) * 28);
	flake.visible = false;
	scene.add(flake);
	snowFlakes.push(flake);
}

// --- Snow cover tiles ---
const snowCoverMat = new THREE.MeshLambertMaterial({ color: 0xeef4ff, transparent: true, opacity: 0 });
const snowCovers = [];
for (const tp of tilePositions) {
	const mat = snowCoverMat.clone();
	const mesh = new THREE.Mesh(grassGeo, mat);
	mesh.position.set(tp.x, tp.y + 0.135, tp.z);
	mesh.scale.setScalar(1.05);
	mesh.visible = false;
	islandGroup.add(mesh);
	snowCovers.push({ mesh, mat });
}

let snowAccumulation = 0; // 0..1

// --- Thunder ---
let thunderFlash = 0;
let nextThunder = performance.now() + 3000 + Math.random() * 5000;
const thunderLight = new THREE.PointLight(0x88b8ff, 0, 120, 2);
thunderLight.position.set(0, 32, 0);
thunderLight.decay = 2;
scene.add(thunderLight);

const thunderFill = new THREE.DirectionalLight(0xb8dcff, 0);
thunderFill.position.set(0, 24, 8);
thunderFill.target.position.set(0, 0, 0);
scene.add(thunderFill);

// =============================================
// WEATHER UPDATE — baselines from day/night; API-smoothed intensities
// =============================================
function updateWeather(elapsed, dt, dayState) {
	const now = performance.now();
	const elapsed_since = now - weatherStartTime;
	const { baselines } = dayState;

	const proc = proceduralSceneTargets();
	const mapLive = latestApiEnv ? mapToSceneWeather(latestApiEnv) : proc;
	const wxTarget = liveWeatherActive && latestApiEnv ? mapLive : proc;
	const windOsc = {
		windDriftX: proc.windStrength * 22 * Math.sin(elapsed * 0.31 + 0.2),
		windDriftZ: proc.windStrength * 18 * Math.cos(elapsed * 0.27),
	};
	const apiWind =
		liveWeatherActive && latestApiEnv
			? { windDriftX: latestApiEnv.wind.vector.x, windDriftZ: latestApiEnv.wind.vector.z }
			: windOsc;
	smoothToward(smoothedWx, { ...wxTarget, ...apiWind }, dt);
	const w = windDriftXZ(dt);

	if (liveWeatherActive && weatherEngine?.lastSuccessTime) {
		const stale = weatherEngine.isStale() ? " · stale" : "";
		weatherCountdown.textContent = `Live${stale} · Open-Meteo — tap for demo`;
	} else {
		const remaining = Math.max(0, WEATHER_DURATION_MS - elapsed_since);
		const rem_s = Math.ceil(remaining / 1000);
		const rem_m = Math.floor(rem_s / 60);
		const rem_ss = rem_s % 60;
		weatherCountdown.textContent = `Demo ${rem_m}:${String(rem_ss).padStart(2, "0")} · tap for live`;
	}

	if (!liveWeatherActive && elapsed_since > WEATHER_DURATION_MS) {
		lastWeather = currentWeather;
		currentWeather = pickNextWeather(currentWeather);
		weatherStartTime = now;
		weatherTransition = 0;
		setWeatherLabel(currentWeather, false);
		if (lastWeather === "snowstorm" && currentWeather === "clear") snowAccumulation = 0;
	}
	weatherTransition = Math.min(1, weatherTransition + dt / 9);
	const tw = weatherTransition;

	const cloudBoost = smoothedWx.cloudDensity;
	const isRain =
		(currentWeather === "rain" || currentWeather === "thunderstorm") && smoothedWx.precipIntensity > 0.08;
	const isWind = currentWeather === "windy" || smoothedWx.windStrength > 0.45;
	const isSnow = currentWeather === "snowstorm" && smoothedWx.precipIntensity > 0.06;
	const isCloud = currentWeather === "cloudy" || cloudBoost > 0.55;
	const isStorm = currentWeather === "thunderstorm" || smoothedWx.thunderActivity > 0.45;
	const isHeavy = isRain || isStorm || isSnow;

	const stormCloudTarget = Math.min(0.92, (isCloud || isHeavy ? 0.78 : 0) * tw * (0.55 + cloudBoost * 0.55));
	const cloudCol = isRain || isStorm ? 0x555566 : isSnow ? 0x99aabb : 0x9999aa;
	stormClouds.forEach((cloud, ci) => {
		cloud.children.forEach((puff) => {
			puff.material.opacity += (stormCloudTarget - puff.material.opacity) * 0.018;
			puff.material.color.setHex(cloudCol);
		});
		const windShift = isWind ? elapsed * cloud.userData.speed * 1.6 : 0;
		cloud.position.x =
			cloud.userData.baseX +
			Math.sin(elapsed * cloud.userData.speed * 0.35 + ci) * 7 +
			(windShift % 35) +
			smoothedWx.windDriftX * 0.18;
		cloud.position.z = cloud.userData.baseZ + smoothedWx.windDriftZ * 0.14 + Math.sin(elapsed * 0.17 + ci) * 1.2;
	});

	const baseCloudDim = isStorm ? Math.min(0.95, 0.3 + cloudBoost * 0.4) : Math.max(0.35, 1 - cloudBoost * 0.35);
	clouds.forEach((c) =>
		c.children.forEach((p) => {
			const baseOp = 0.85;
			if (p.material)
				p.material.opacity = Math.min(
					0.88,
					(p.material.opacity || baseOp) * baseCloudDim + (isStorm ? 0 : baseOp * (1 - baseCloudDim)),
				);
		}),
	);

	if (isCloud || isHeavy) {
		const grey = isStorm ? new THREE.Color(0x222233) : isSnow ? new THREE.Color(0x99aabb) : new THREE.Color(0x778899);
		if (scene.background instanceof THREE.Color) {
			scene.background.lerp(grey, 0.04 * tw * (0.5 + cloudBoost * 0.5));
		}
	}

	const weatherDim = isStorm ? 0.45 : isRain ? 0.6 : isCloud ? 0.78 : isSnow ? 0.82 : 1.0;
	const apiDim = 1 - smoothedWx.fogDensity * 0.35;
	const dim = weatherDim * apiDim;

	ambientLight.intensity = baselines.ambientIntensity * dim;
	sunLight.intensity = baselines.sunIntensity * dim;
	sunLight.color.copy(baselines.sunColor);
	hemisphereLight.intensity = baselines.hemisphereIntensity * dim * (1 - smoothedWx.fogDensity * 0.25);

	const fogD = THREE.MathUtils.clamp(smoothedWx.fogDensity * 0.085, 0, 0.095);
	sceneFog.color.copy(scene.background);
	sceneFog.density = fogD;

	if (isWind) {
		clouds.forEach((cloud) => {
			cloud.position.x =
				cloud.userData.startX + elapsed * cloud.userData.speed * 2.2 + smoothedWx.windDriftX * 0.12;
			cloud.position.z = cloud.userData.startZ + smoothedWx.windDriftZ * 0.1;
			if (cloud.position.x > 20) cloud.userData.startX -= 40;
		});
	} else {
		for (const cloud of clouds) {
			cloud.position.x =
				cloud.userData.startX + Math.sin(elapsed * cloud.userData.speed * 0.4) * 5 + smoothedWx.windDriftX * 0.08;
			cloud.position.z = cloud.userData.startZ + smoothedWx.windDriftZ * 0.06;
		}
	}

	const rainStrength = (isRain ? Math.min(1, tw) : 0) * smoothedWx.precipIntensity;
	rainDrops.forEach((drop, i) => {
		drop.visible = i < rainDrops.length * rainStrength;
		if (!drop.visible) return;
		drop.position.x += (drop.userData.vx + w.x * 0.8) * dt;
		drop.position.y += drop.userData.vy * dt * (isStorm ? 1.5 : 1);
		drop.position.z += (drop.userData.vz + w.z * 0.8) * dt;
		if (drop.position.y < -5) {
			drop.position.set((Math.random() - 0.5) * 30, 14 + Math.random() * 8, (Math.random() - 0.5) * 30);
		}
	});

	puddleMeshes.forEach((p) => {
		const targetOp = isRain ? 0.4 * tw * smoothedWx.precipIntensity : 0;
		p.mat.opacity += (targetOp - p.mat.opacity) * 0.015;
		p.mesh.visible = p.mat.opacity > 0.01;
		if (p.mesh.visible) {
			const ripple = 1 + 0.07 * Math.sin(elapsed * 2.8 + p.phase);
			p.mesh.scale.setScalar(ripple);
		}
	});

	const leafFraction = (isWind ? Math.min(1, tw) : 0) * Math.min(1, smoothedWx.windStrength * 1.2);
	leafParticles.forEach((leaf, i) => {
		leaf.visible = i < leafParticles.length * leafFraction;
		if (!leaf.visible) return;
		leaf.userData.wobble += dt * 2.8;
		leaf.position.x += (leaf.userData.vx + Math.sin(leaf.userData.wobble) * 1.5 + w.x * 1.2) * dt;
		leaf.position.y += leaf.userData.vy * dt;
		leaf.position.z += (leaf.userData.vz + Math.cos(leaf.userData.wobble * 0.7) * 1.2 + w.z * 1.2) * dt;
		leaf.rotation.z += leaf.userData.spin * dt;
		leaf.rotation.x += leaf.userData.spin * 0.4 * dt;
		if (leaf.position.y < -5 || Math.abs(leaf.position.x) > 18) {
			leaf.position.set((Math.random() - 0.5) * 26, 9 + Math.random() * 5, (Math.random() - 0.5) * 26);
		}
	});

	const snowStrength = (isSnow ? Math.min(1, tw) : 0) * smoothedWx.precipIntensity;
	snowFlakes.forEach((flake, i) => {
		flake.visible = i < snowFlakes.length * snowStrength;
		if (!flake.visible) return;
		flake.userData.wobble += dt * 1.6;
		flake.position.x += (flake.userData.vx + Math.sin(flake.userData.wobble * 0.6) * 0.7 + w.x * 0.5) * dt;
		flake.position.y += flake.userData.vy * dt;
		flake.position.z += (flake.userData.vz + Math.cos(flake.userData.wobble * 0.4) * 0.7 + w.z * 0.5) * dt;
		if (flake.position.y < -5) {
			flake.position.set((Math.random() - 0.5) * 28, 14 + Math.random() * 8, (Math.random() - 0.5) * 28);
		}
	});

	if (isSnow) {
		snowAccumulation = Math.min(1, snowAccumulation + dt * 0.014 * smoothedWx.precipIntensity);
	} else if (currentWeather === "clear" && lastWeather === "snowstorm") {
		snowAccumulation = Math.max(0, snowAccumulation - dt * 0.05);
	}
	const target = snowAccumulation * 0.93;
	snowCovers.forEach((sc) => {
		sc.mat.opacity += (target - sc.mat.opacity) * 0.04;
		sc.mesh.visible = sc.mat.opacity > 0.01;
	});
	if (cabinSnowMaterial) {
		cabinSnowMaterial.opacity += (target - cabinSnowMaterial.opacity) * 0.04;
	}
	treeSnowMaterials.forEach((mat) => {
		mat.opacity += (target - mat.opacity) * 0.04;
	});

	const tAct = isStorm ? Math.min(1, tw) * smoothedWx.thunderActivity : 0;
	const thunderGap = 2500 + (1.15 - tAct) * 7500;
	if (isStorm && tAct > 0.08 && now > nextThunder) {
		thunderFlash = (2 + Math.random() * 1.8) * (0.35 + tAct * 0.65);
		nextThunder = now + thunderGap * (0.5 + Math.random() * 0.5);
	}
	if (thunderFlash > 0) {
		thunderFlash = Math.max(0, thunderFlash - dt * 8);
		const pulse = 0.65 + Math.sin(elapsed * 34.7) * 0.28;
		const tScale = 0.4 + tAct * 0.6;
		thunderLight.intensity = Math.max(0, thunderFlash * 2.4 * pulse * tScale);
		thunderFill.intensity = Math.max(0, thunderFlash * 1.2 * pulse * tScale);
		if (thunderFlash > 0.6) {
			ambientLight.intensity = Math.max(ambientLight.intensity, thunderFlash * 0.22 * tScale);
			sunLight.intensity = Math.max(sunLight.intensity, thunderFlash * 0.28 * tScale);
			hemisphereLight.intensity = Math.max(hemisphereLight.intensity, thunderFlash * 0.18 * tScale);
			const blueFlash = new THREE.Color(0xadcfff);
			if (scene.background instanceof THREE.Color) scene.background.lerp(blueFlash, Math.min(0.35, thunderFlash * 0.14));
		}
	} else {
		thunderLight.intensity = 0;
		thunderFill.intensity = 0;
	}
}

// =============================================
// ANIMATION LOOP
// =============================================
const timer = new THREE.Timer();

function animate() {
	timer.update();
	const elapsed = timer.getElapsed();
	const dt = Math.min(timer.getDelta(), 0.05);

	islandGroup.rotation.y = elapsed * 0.05;

	updateFallingStars(dt);

	for (const cloud of clouds) {
		cloud.position.y += Math.sin(elapsed * 0.3 + cloud.userData.startX) * 0.0003;
	}

	const dayState = updateDayNightCycle();
	moonShaderUniforms.uTime.value = elapsed;
	updateWeather(elapsed, dt, dayState);

	const flicker = 1 + Math.sin(elapsed * 13.7) * 0.04 + Math.sin(elapsed * 7.3) * 0.03;
	cabinLight.intensity *= flicker;

	controls.update();
	renderer.render(scene, camera);
}

renderer.setAnimationLoop(animate);

weatherEngine = new WeatherEngine({
	interval: 90_000,
	onUpdate: (env) => {
		latestApiEnv = env;
		if (env.latitude != null) observerLatitudeRad = (env.latitude * Math.PI) / 180;
		if (liveWeatherActive) {
			const m = mapToSceneWeather(env);
			currentWeather = m.category;
			setWeatherLabel(currentWeather, true);
		}
	},
	onError: (e) => console.warn("WeatherEngine:", e?.message ?? e),
});
weatherEngine.start().catch((e) => console.warn("WeatherEngine start:", e));

window.addEventListener("resize", () => {
	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();
	renderer.setSize(window.innerWidth, window.innerHeight);
});
