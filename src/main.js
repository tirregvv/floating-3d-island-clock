import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import WeatherEngine, { mapToSceneWeather } from "../weatherEngine.js";
import * as config from "./config.js";
import { seededRandom } from "./utils/rng.js";
import { createMaterials } from "./materials.js";
import { buildTerrain } from "./world/terrain.js";
import { buildCabin } from "./world/cabin.js";
import { buildVegetation } from "./world/vegetation.js";
import { buildCelestial } from "./sky/celestial.js";
import { createMainLights } from "./lights.js";
import { createSkyPalette } from "./dayNight.js";
import { buildWeatherEffects } from "./weather/effects.js";
import { pickNextWeather, isSnowCategory } from "./weather/updateWeather.js";
import { bindTimeUi } from "./ui/timeUi.js";
import { bindFullscreenToggle } from "./ui/fullscreenUi.js";
import { setWeatherLabel, setLocationWeatherOverlay } from "./ui/weatherUi.js";
import { startAnimationLoop } from "./loop.js";

const prefersReducedMotion =
	typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

const canvas = document.getElementById("canvas");
const scene = new THREE.Scene();
const isMobileDevice = config.mobileUserAgentRe.test(navigator.userAgent);

const cam = config.camera;
const camera = new THREE.PerspectiveCamera(cam.fov, window.innerWidth / window.innerHeight, cam.near, cam.far);
camera.position.set(...cam.position);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, config.renderer.maxPixelRatio));
renderer.shadowMap.enabled = !isMobileDevice;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = config.renderer.toneMappingExposure;

const celestialShell = new THREE.Group();
celestialShell.name = "celestialShell";
scene.add(celestialShell);

const sceneFog = new THREE.FogExp2(config.colors.fog, 0);
scene.fog = sceneFog;

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
const oc = config.orbitControls;
controls.dampingFactor = oc.dampingFactor;
controls.minDistance = oc.minDistance;
controls.maxDistance = oc.maxDistance;
controls.maxPolarAngle = oc.maxPolarAngle;
controls.minPolarAngle = oc.minPolarAngle;
controls.target.set(...oc.target);
controls.update();

const timeSlider = document.getElementById("time-slider");
const resetBtn = document.getElementById("reset-btn");
bindTimeUi(timeSlider, resetBtn);

const weatherLabel = document.getElementById("weather-label");
const weatherCountdown = document.getElementById("weather-countdown");
const fullscreenToggle = document.getElementById("fullscreen-toggle");
bindFullscreenToggle(fullscreenToggle);

const rng = seededRandom(config.terrain.rngSeed);
const materials = createMaterials();
const islandGroup = new THREE.Group();
islandGroup.name = "islandGroup";
scene.add(islandGroup);

const { tilePositions, grassGeo } = buildTerrain(islandGroup, materials, rng);
const { cabinLight, cabinSnowMaterial } = buildCabin(islandGroup, materials, tilePositions, isMobileDevice);
const treeSnowMaterials = [];
const { treeMeshes } = buildVegetation(islandGroup, materials, tilePositions, rng, treeSnowMaterials);

const celestial = buildCelestial(scene, celestialShell, materials, rng, isMobileDevice);
const mainLights = createMainLights(scene, isMobileDevice);
const skyPalette = createSkyPalette();

const effects = buildWeatherEffects(scene, islandGroup, tilePositions, grassGeo);

const observerLat = { rad: (config.dayNight.defaultLatitudeDeg / 180) * Math.PI };

const weatherState = {
	currentWeather: "clear",
	lastWeather: null,
	weatherStartTime: performance.now(),
	weatherTransition: 1.0,
	liveWeatherActive: config.weather.defaultLive,
	/** True until first live weather snapshot (geolocation + Open-Meteo) arrives. */
	awaitingLiveLocation: false,
	demoIntensity: 1,
	latestApiEnv: null,
	snowAccumulation: 0,
	thunderFlash: 0,
	nextThunder: performance.now() + 3000 + Math.random() * 5000,
	smoothedWx: {
		cloudDensity: 0,
		fogDensity: 0,
		precipIntensity: 0,
		thunderActivity: 0,
		windStrength: 0,
		windDriftX: 0,
		windDriftZ: 0,
	},
};

let weatherEngine = null;

const weatherCtx = {
	scene,
	sceneFog,
	clouds: celestial.clouds,
	stormClouds: effects.stormClouds,
	rainDrops: effects.rainDrops,
	puddleMeshes: effects.puddleMeshes,
	leafParticles: effects.leafParticles,
	snowFlakes: effects.snowFlakes,
	snowCovers: effects.snowCovers,
	thunderLight: effects.thunderLight,
	thunderFill: effects.thunderFill,
	ambientLight: mainLights.ambientLight,
	sunLight: mainLights.sunLight,
	hemisphereLight: mainLights.hemisphereLight,
	weatherState,
	get weatherEngine() {
		return weatherEngine;
	},
	weatherCountdown,
	weatherLabel,
	cabinSnowMaterial,
	treeSnowMaterials,
	treeMeshes,
	prefersReducedMotion,
};

const dayNightCtx = {
	scene,
	camera,
	sunLight: mainLights.sunLight,
	sunMesh: celestial.sunMesh,
	moonMesh: celestial.moonMesh,
	moonLight: celestial.moonLight,
	moonShaderUniforms: celestial.moonShaderUniforms,
	starMat: celestial.starMat,
	windowMat: materials.windowMat,
	cabinLight,
	lanternGlowMat: materials.lanternGlowMat,
	ambientLight: mainLights.ambientLight,
	hemisphereLight: mainLights.hemisphereLight,
	celestialShell,
	sunMat: celestial.sunMat,
	prefersReducedMotion,
	palette: skyPalette,
	observerLat,
};

function weatherLabelTitle() {
	const names = ["light", "medium", "strong"];
	const i = Math.max(0, Math.min(2, weatherState.demoIntensity ?? 1));
	if (weatherState.liveWeatherActive) return "Live weather (Open-Meteo). Tap the timer for demo mode.";
	return `Demo: cycle weather. Shift+click: demo intensity (${names[i]}). Tap the timer for live. Forecast: Open-Meteo (open-meteo.com)`;
}

function refreshLocationWeatherOverlay() {
	setLocationWeatherOverlay(weatherState.latestApiEnv, weatherState);
}

setWeatherLabel(weatherLabel, weatherState.currentWeather, true, weatherState.liveWeatherActive);
weatherLabel.title = weatherLabelTitle();

weatherLabel.addEventListener("click", (e) => {
	if (e.shiftKey) {
		weatherState.demoIntensity = ((weatherState.demoIntensity ?? 1) + 1) % 3;
		weatherState.weatherStartTime = performance.now();
		weatherState.weatherTransition = 0;
		weatherLabel.title = weatherLabelTitle();
		refreshLocationWeatherOverlay();
		return;
	}
	weatherState.liveWeatherActive = false;
	weatherState.lastWeather = weatherState.currentWeather;
	weatherState.currentWeather = pickNextWeather(weatherState.currentWeather);
	weatherState.weatherStartTime = performance.now();
	weatherState.weatherTransition = 0;
	setWeatherLabel(weatherLabel, weatherState.currentWeather, false, weatherState.liveWeatherActive);
	weatherLabel.title = weatherLabelTitle();
	refreshLocationWeatherOverlay();
	if (isSnowCategory(weatherState.lastWeather) && weatherState.currentWeather === "clear") weatherState.snowAccumulation = 0;
});

weatherCountdown.addEventListener("click", () => {
	weatherState.liveWeatherActive = true;
	if (!weatherState.latestApiEnv) weatherState.awaitingLiveLocation = true;
	if (weatherState.latestApiEnv) {
		const m = mapToSceneWeather(weatherState.latestApiEnv);
		weatherState.currentWeather = m.category;
		setWeatherLabel(weatherLabel, weatherState.currentWeather, true, weatherState.liveWeatherActive);
	} else {
		setWeatherLabel(weatherLabel, weatherState.currentWeather, true, weatherState.liveWeatherActive);
	}
	weatherState.weatherStartTime = performance.now();
	weatherState.weatherTransition = 1;
	weatherLabel.title = weatherLabelTitle();
	refreshLocationWeatherOverlay();
});

if (weatherState.liveWeatherActive) {
	weatherState.awaitingLiveLocation = true;
}

weatherEngine = new WeatherEngine({
	interval: config.weatherApi.intervalMs,
	staleMs: config.weatherApi.staleMs,
	backoffStepsMs: config.weatherApi.backoffStepsMs,
	fallbackCoords: config.weatherApi.fallbackCoords,
	geolocationTimeoutMs: config.weatherApi.geolocationTimeoutMs,
	geolocationQuickTimeoutMs: config.weatherApi.geolocationQuickTimeoutMs,
	geolocationQuickMaxAgeMs: config.weatherApi.geolocationQuickMaxAgeMs,
	smoothing: config.weatherApi.smoothing,
	onUpdate: (env) => {
		weatherState.awaitingLiveLocation = false;
		weatherState.latestApiEnv = env;
		setLocationWeatherOverlay(env, weatherState);
		if (env.latitude != null) observerLat.rad = (env.latitude * Math.PI) / 180;
		if (weatherState.liveWeatherActive) {
			const m = mapToSceneWeather(env);
			weatherState.currentWeather = m.category;
			setWeatherLabel(weatherLabel, weatherState.currentWeather, true, weatherState.liveWeatherActive);
			weatherLabel.title = weatherLabelTitle();
		}
	},
	onError: (e) => {
		console.warn("WeatherEngine:", e?.message ?? e);
		weatherState.awaitingLiveLocation = false;
		setLocationWeatherOverlay(weatherState.latestApiEnv, weatherState);
	},
});
weatherEngine.start().catch((e) => {
	console.warn("WeatherEngine start:", e);
	weatherState.awaitingLiveLocation = false;
	setLocationWeatherOverlay(weatherState.latestApiEnv, weatherState);
});

if (weatherState.liveWeatherActive) {
	setLocationWeatherOverlay(weatherState.latestApiEnv, weatherState);
}

startAnimationLoop({
	islandGroup,
	clouds: celestial.clouds,
	updateFallingStars: celestial.updateFallingStars,
	dayNightCtx,
	moonShaderUniforms: celestial.moonShaderUniforms,
	weatherCtx,
	cabinLight,
	controls,
	camera,
	renderer,
	scene,
});

window.addEventListener("resize", () => {
	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();
	renderer.setSize(window.innerWidth, window.innerHeight);
});
