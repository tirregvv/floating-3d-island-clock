/** Central tweakables for the island clock app. */

/** Matches typical phone/tablet browsers; also used by isConstrainedMobileClient in utils/gpuProfile.js. */
export const mobileUserAgentRe = /Mobi|Android|iPhone|iPad|iPod|BlackBerry|Opera Mini|IEMobile/;

/**
 * Heuristics for evaluateGpuProfile() — WebGL limits and coarse hardware hints (desktop + TV).
 * Handhelds additionally skip shadow maps in buildRenderStyle() regardless of these limits — reported
 * capabilities often allow shadows while drivers still fail (black output); see three.js shadow discussions.
 */
export const gpuProfileThresholds = {
	/** Below this MAX_TEXTURE_SIZE, shadow maps are disabled entirely. */
	minTextureSizeForShadows: 4096,
	/** Below this MAX_RENDERBUFFER_SIZE, shadow maps are disabled (some embed GPUs). */
	minRenderbufferSizeForShadows: 8192,
	/** Below this MAX_CUBE_MAP_TEXTURE_SIZE, shadow maps are disabled. */
	minCubeMapTextureSizeForShadows: 2048,
	/**
	 * WebGL1 only: below this MAX_TEXTURE_SIZE, shadows are disabled.
	 * (WebGL2 browsers are gated by minTextureSizeForShadows.)
	 */
	webgl1MinTextureSizeForShadows: 4096,
	/**
	 * At or below this MAX_TEXTURE_SIZE, use compact (mobile) shadow atlas sizes when shadows stay on.
	 * Cards that cap at 8192 still work but benefit from smaller maps.
	 */
	fullTierMinTextureSize: 12288,
	/** deviceMemory (GiB) — if reported, disable shadows at or below this. */
	disableShadowsDeviceMemoryGb: 2,
	/** deviceMemory (GiB) — if reported, prefer compact shadow maps at or below this. */
	reduceShadowsDeviceMemoryGb: 4,
	/** CPU cores — at or below this, prefer compact shadow maps (optional API). */
	reduceShadowsHardwareConcurrency: 4,
	/** deviceMemory (GiB) — suggest brighter fill light when at or below (optional API). */
	boostFillLightingDeviceMemoryGb: 4,
	/**
	 * Narrow embedded-TV / STB UA: if MAX_TEXTURE_SIZE is below this, shadow maps are disabled.
	 * Many living-room browsers report moderate limits; this avoids a known broken “full” path.
	 */
	embeddedTvDisableShadowsBelowTextureSize: 16384,
};

export const renderer = {
	maxPixelRatio: 2,
	/**
	 * Smart TV browsers: render fewer physical pixels (4K × DPR is brutal on TV SoCs).
	 * See three.js forum notes on capping devicePixelRatio for sustained frame times.
	 */
	embeddedMaxPixelRatio: 1,
	toneMappingExposure: 1.0,
};

/** Multiply particle/mesh counts when isEmbeddedDisplayClient (utils/gpuProfile.js) is true. */
export const embeddedDisplayScale = {
	trees: 0.82,
	rocks: 0.82,
	flowers: 0.72,
	baseClouds: 0.65,
	stormClouds: 0.58,
	rainDrops: 0.48,
	puddles: 0.55,
	leafParticles: 0.48,
	snowFlakes: 0.48,
	stars: 0.55,
	fireflies: 0.68,
};

/** Softer motion on TVs (less vertex churn per frame from bobbing/sway). */
export const embeddedDisplayAnimation = {
	/** Multiplies island spin rate. */
	motionScale: 0.62,
	/** Multiplies cloud vertical bob amplitude in the animation loop. */
	cloudBobScale: 0.55,
};

export const camera = {
	fov: 50,
	near: 0.1,
	far: 500,
	position: [22, 16, 22],
};

export const orbitControls = {
	dampingFactor: 0.06,
	minDistance: 10,
	maxDistance: 55,
	maxPolarAngle: Math.PI / 2.05,
	minPolarAngle: 0.2,
	target: [0, 1, 0],
};

export const terrain = {
	gridSize: 19,
	tileSize: 1.0,
	gap: 0.07,
	islandRadius: 9.2,
	heightCosScale: 2.4,
	heightNoise: 0.12,
	rngSeed: 42,
	depthStone1: 0.35,
	depthStone2: 0.6,
};

export const counts = {
	trees: 32,
	treeDistMin: 0.1,
	rocks: 35,
	rockDistMin: 0.12,
	flowers: 55,
	flowerDistMin: 0.1,
	baseClouds: 10,
	stormClouds: 16,
	rainDrops: 350,
	puddles: 45,
	leafParticles: 130,
	snowFlakes: 400,
	stars: 700,
};

export const cabin = {
	scale: 0.85,
	yOffsetOnTile: 0.12,
};

export const celestial = {
	sunDistance: 24,
	zBias: 7,
	moonRadius: 1.8,
	moonSegments: 32,
	sunRadius: 1.6,
	sunSegments: 24,
	cloudSpread: 28,
	cloudBaseY: 7,
	cloudYJitter: 4,
	fallingStar: {
		nextDelayMinMs: 7000,
		nextDelayExtraMs: 6000,
		updateNextDelayExtraMs: 7000,
	},
	starPointSize: 0.45,
	starRadiusMin: 120,
	starRadiusExtra: 80,
};

export const lights = {
	ambientColor: 0x8899bb,
	ambientIntensityMobile: 0.55,
	ambientIntensityDesktop: 0.4,
	sunColor: 0xffeedd,
	sunIntensity: 1.2,
	sunShadowMapSize: 2048,
	sunShadowMapSizeMobile: 1024,
	hemisphereSky: 0x87ceeb,
	hemisphereGround: 0x5c4530,
	hemisphereIntensityMobile: 0.4,
	hemisphereIntensityDesktop: 0.3,
	moonLightColor: 0x6b8ec8,
	moonShadowMapSize: 1024,
	moonShadowMapSizeMobile: 512,
	cabinLightColor: 0xffaa33,
	cabinLightDistance: 6.0,
	cabinLightShadowMapSize: 512,
	cabinLightShadowMapSizeMobile: 256,
};

export const colors = {
	grass: 0x6abf4b,
	dirt1: 0x8b6b4a,
	dirt2: 0x735839,
	dirt3: 0x5c4530,
	stone: 0x7a7a7a,
	stone2: 0x5e5e5e,
	wood: 0x8b6839,
	roof: 0xa0522d,
	door: 0x5c3a1e,
	trunk: 0x6b4226,
	leaves: 0x3d8b37,
	leaves2: 0x4ea843,
	rock: 0x8a8a8a,
	rock2: 0x6e6e6e,
	flowerStem: 0x3a7d32,
	flowerPetals: [0xff6b8a, 0xffd93d, 0xae7cff, 0xff9f43, 0x74b9ff],
	cloud: 0xffffff,
	window: 0xc8e6ff,
	windowEmissive: 0x445566,
	lantern: 0xffdd88,
	lanternEmissive: 0xffaa33,
	snow: 0xffffff,
	snowEmissive: 0xc8e8ff,
	fog: 0x05081a,
	daySkyTop: 0x87ceeb,
	daySkyBot: 0xb8d8f0,
	sunsetSkyTop: 0xff7744,
	sunsetSkyBot: 0xffaa55,
	nightSkyTop: 0x05081a,
	nightSkyBot: 0x0d1133,
	daySun: 0xfff5e0,
	sunsetSun: 0xff8844,
	nightSun: 0x334488,
	sunMesh: 0xfff5e0,
	rain: 0x88aacc,
	puddle: 0x5577aa,
	leaf1: 0x4ea843,
	leaf2: 0xd4a84b,
	leaf3: 0xc05a2a,
	deciduousLeaves: 0x5a9f4a,
	deciduousLeaves2: 0x6eb85a,
	snowFlake: 0xddeeff,
	snowCover: 0xeef4ff,
	thunderPoint: 0x88b8ff,
	thunderFill: 0xb8dcff,
	thunderBlueFlash: 0xadcfff,
	stormCloudBase: 0x888899,
};

export const timeUi = {
	sliderMax: 1440,
	updateIntervalMs: 1000,
};

/**
 * Night fireflies — instanced meshes + optional capped PointLights (many real lights are costly).
 * Collision: height band (min/max above tiles) + cylinders (trees), spheres (rocks), AABB (cabin) — all soft/velocity like the rest; no mesh Raycaster.
 */
export const fireflies = {
	enabled: true,
	/** Active instances on typical desktop (see embeddedDisplayScale.fireflies for TVs). */
	count: 20,
	embeddedMinCount: 8,
	/** Minimum height above tile surface (grass tops roughly at +0.11 world). */
	minHeightAboveGround: 0.22,
	maxHeightAboveGround: 0.75,
	/** Hull inflation for obstacle pushes (world units). */
	clearance: 0.09,
	/** Fraction of overlap resolved per frame (lower = smoother, slower escape). */
	collisionSoftness: 0.22,
	/** When separating from obstacles, blend this much toward +Y vs sideways (0–1). */
	collisionUpBias: 0.86,
	/** Upward velocity boost while overlapping an obstacle (gentle arc over trees/rocks). */
	collisionLiftAccel: 5.2,
	/** Damp velocity into obstacle along inward normal (0–1). */
	collisionRadialDamp: 0.58,
	/** Island rim: same idea — pull inward gradually instead of snapping. */
	edgeSoftness: 0.28,
	/**
	 * Height-band (terrain + min/max flight): same smooth pipeline as obstacles.
	 * Uses groundLiftAccel / groundCeilingAccel on velocity, then groundCollisionSoftness on position.
	 * Lower accel + penetration cap keeps terrain following calm (slopes won’t spike vy).
	 */
	groundLiftAccel: 2.35,
	groundCeilingAccel: 2.35,
	/** Only this much “depth below floor / above ceiling” affects lift accel per frame (linear cap). */
	groundLiftPenCap: 0.42,
	/** Per-frame separation toward allowed band (defaults to collisionSoftness if omitted). */
	groundCollisionSoftness: 0.17,
	/** Damps velocity into the floor or ceiling (like collisionRadialDamp). */
	groundVelocityNormalDamp: 0.68,
	/** Layered sine steering strength (pseudo–curl-noise wander without extra deps). */
	wanderAccel: 1.05,
	wanderFreq1: 0.41,
	wanderFreq2: 0.74,
	velocityDamping: 2.85,
	maxSpeed: 1.4,
	/** Billboard sphere radius scale (world units after instance matrix). */
	instanceScale: 0.018,
	color: 0xb8f062,
	materialOpacity: 0.92,
	brightnessJitter: 0.26,
	/**
	 * Multiplier on PointLight intensity (material glow + additive blend still reads without lights).
	 * Set pointLightIntensity to 0 to disable real lights entirely.
	 */
	lightEmissionScale: 0.7,
	pointLightIntensity: 0.32,
	pointLightDistance: 3.4,
	pointLightDecay: 2,
	maxPointLights: 14,
	/** Slow global brightness drift (lower freq + amp = calmer). */
	flickerFreq1: 3.1,
	flickerFreq2: 4.6,
	flickerAmp: 0.045,
	/** Tiny per-firefly variation; keep small — high freq reads as harsh strobing. */
	flickerFlutterAmp: 0.028,
	flickerFlutterFreq: 1.55,
	/** Fade in after nightFactor crosses nightVisibilityStart (matches updateDayNightCycle nightFactor). */
	nightVisibilityStart: 0.28,
	nightVisibilityRange: 0.52,
	reducedMotionScale: 0.45,
	/** Horizontal flight bound vs terrain.islandRadius (stay over solid tiles). */
	islandRadiusMargin: 0.88,
};

export const animation = {
	islandRotationSpeed: 0.05,
	maxDelta: 0.05,
	cloudBobFactor: 0.0003,
	cloudBobPhase: 0.3,
	cabinFlickerA: 13.7,
	cabinFlickerB: 7.3,
	cabinFlickerAmp1: 0.04,
	cabinFlickerAmp2: 0.03,
};

export const dayNight = {
	defaultLatitudeDeg: 45,
	sunVisibilityY: -1.5,
	moonVisibilityY: -3,
	starTwinkleCoef: 0.04,
	starTwinkleTimeScale: 0.0021,
	starOpacityCap: 0.95,
	starOpacityBase: 0.85,
	/** Shader uniform scale when the moon is above the horizon (constant while visible). */
	moonBrightnessVisible: 1.15,
	/** Directional moon light intensity while the moon is visible (0 when hidden). */
	moonLightIntensityScale: 0.5,
	shellLatFactor: 0.38,
	shellDeclFactor: 0.15,
	nightWindowThreshold: 0.3,
	windowEmissiveNight: 0xffaa44,
	abovenessDay: 0.15,
	abovenessTwilight: 0.3,
};

export const weather = {
	durationMs: 5 * 60 * 1000,
	transitionSeconds: 9,
	windClamp: 28,
	windDriftMulX: 0.11,
	windDriftMulZ: 0.09,
	smoothRate: 2.2,
	windOscXMul: 22,
	windOscZMul: 18,
	windOscPhase1: 0.31,
	windOscPhase2: 0.27,
	/** Multiplier for wind-driven cloud drift/orbit (storm + base clouds) when wind is active. */
	cloudWindMotionScale: 0.55,
	/** Max tree foliage bend (radians) around trunk-top pivot at full wind. */
	treeWindBendMaxRad: 0.12,
	treeSwayF1Min: 0.52,
	treeSwayF1Spread: 0.58,
	treeSwayF2Min: 0.68,
	treeSwayF2Spread: 0.72,
	defaultLive: true,
	icons: {
		clear: "\u2600\uFE0F",
		cloudy: "\u2601\uFE0F",
		drizzle: "\uD83C\uDF27\uFE0F",
		rain: "\uD83C\uDF27\uFE0F",
		downpour: "\uD83C\uDF27\uFE0F",
		windy: "\uD83C\uDF2C\uFE0F",
		thunderstorm: "\u26C8\uFE0F",
		snow: "\u2744\uFE0F",
		snowstorm: "\u2744\uFE0F",
	},
	demoNightStart: 0.22,
	demoNightEnd: 0.78,
	demoWeights: {
		clear: 18,
		cloudy: 16,
		drizzle: 12,
		rain: 12,
		downpour: 8,
		windy: 14,
		thunderstormNight: 20,
		thunderstormDay: 5,
		snow: 10,
		snowstorm: 8,
	},
	fogDensityScale: 0.085,
	fogDensityMax: 0.095,
	snowMeltRate: 0.05,
	snowAccumRate: 0.014,
	snowTargetScale: 0.93,
	opacityLerp: 0.04,
	thunderDecay: 8,
	thunderPulseFreq: 34.7,
	/** Rain streaks (unlit lines): boost when sun is up so they read against bright sky. */
	rainOpacityMin: 0.52,
	rainOpacityDay: 0.92,
	rainLineScaleDay: 1.45,
	rainDayTint: 0xc8eaff,
	rainDayTintMix: 0.82,
};

export const weatherApi = {
	intervalMs: 90_000,
	staleMs: 45 * 60 * 1000,
	backoffStepsMs: [60_000, 120_000, 300_000, 900_000],
	fallbackCoords: { lat: 52.52, lon: 13.405 },
	/** First geolocation attempt: short timeout + stale fix OK — fast on mobile reload. */
	geolocationQuickTimeoutMs: 4_500,
	geolocationQuickMaxAgeMs: 900_000,
	geolocationTimeoutMs: 12_000,
	smoothing: 0.1,
};

/** WMO weather code groupings for mapToSceneWeather. */
export const weatherRules = {
	snowCodes: [71, 73, 75, 77, 85, 86],
	snowHeavyCodes: [75, 86],
	drizzleCodes: [51, 53, 55, 56, 57],
	rainHeavy: [65, 82, 92],
	rainLight: [51, 53, 55, 56, 57, 61, 63, 66, 67, 80, 81],
	thunderCodes: [95, 96, 99],
	snowTempThreshold: 1.5,
	windSpeedWindy: 35,
	windStrengthDivisor: 40,
	cloudyCodeMin: 1,
	cloudyCodeMax: 3,
};

export const materials = {
	cloudOpacity: 0.85,
	windowEmissiveIntensity: 0.2,
	lanternEmissiveIntensity: 0.3,
	snowOpacity: 0.95,
	sunMeshOpacity: 0.95,
	leafOpacity: 0.55,
	snowFlakeOpacity: 0.85,
};
