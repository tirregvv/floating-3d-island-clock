import * as THREE from "three";
import * as config from "../config.js";
import { mapToSceneWeather } from "../../weatherEngine.js";
import { getDayProgress } from "../timeState.js";
import { setWeatherLabel, setLocationWeatherOverlay } from "../ui/weatherUi.js";
import { driveWeatherAudio, playThunderRollSfx } from "../audio/weatherAudio.js";

export function isSnowCategory(w) {
	return w === "snow" || w === "snowstorm";
}

function isRainCategory(w) {
	return w === "drizzle" || w === "rain" || w === "downpour" || w === "thunderstorm";
}

function proceduralSceneTargets(currentWeather) {
	const w = currentWeather;
	switch (w) {
		case "thunderstorm":
			return { cloudDensity: 0.9, fogDensity: 0.12, precipIntensity: 0.85, thunderActivity: 0.9, windStrength: 0.55 };
		case "downpour":
			return { cloudDensity: 0.72, fogDensity: 0.11, precipIntensity: 0.92, thunderActivity: 0.12, windStrength: 0.42 };
		case "rain":
			return { cloudDensity: 0.55, fogDensity: 0.08, precipIntensity: 0.65, thunderActivity: 0.15, windStrength: 0.25 };
		case "drizzle":
			return { cloudDensity: 0.42, fogDensity: 0.06, precipIntensity: 0.3, thunderActivity: 0.02, windStrength: 0.15 };
		case "snowstorm":
			return { cloudDensity: 0.75, fogDensity: 0.15, precipIntensity: 0.8, thunderActivity: 0.05, windStrength: 0.35 };
		case "snow":
			return { cloudDensity: 0.58, fogDensity: 0.1, precipIntensity: 0.45, thunderActivity: 0.03, windStrength: 0.22 };
		case "cloudy":
			return { cloudDensity: 0.72, fogDensity: 0.04, precipIntensity: 0, thunderActivity: 0, windStrength: 0.12 };
		case "windy":
			return { cloudDensity: 0.35, fogDensity: 0.02, precipIntensity: 0, thunderActivity: 0, windStrength: 0.85 };
		default:
			return { cloudDensity: 0.15, fogDensity: 0, precipIntensity: 0, thunderActivity: 0, windStrength: 0.08 };
	}
}

/** Demo-only: 0 = mild, 1 = default, 2 = stronger (scales procedural targets). */
function applyDemoIntensityBlend(base, level) {
	const lo = 0.78;
	const mid = 1;
	const hi = 1.22;
	const s = level <= 0 ? lo : level >= 2 ? hi : mid;
	return {
		cloudDensity: THREE.MathUtils.clamp(base.cloudDensity * (0.92 + (level * 0.06)), 0, 1),
		fogDensity: THREE.MathUtils.clamp(base.fogDensity * (0.75 + level * 0.15), 0, 1),
		precipIntensity: THREE.MathUtils.clamp(base.precipIntensity * s, 0, 1),
		thunderActivity: THREE.MathUtils.clamp(base.thunderActivity * (0.88 + level * 0.08), 0, 1),
		windStrength: THREE.MathUtils.clamp(base.windStrength * (0.88 + level * 0.1), 0, 1),
	};
}

export function pickNextWeather(prev) {
	if (prev === "snowstorm") return "clear";
	const t = getDayProgress();
	const wcfg = config.weather;
	const isNight = t < wcfg.demoNightStart || t > wcfg.demoNightEnd;
	const dw = wcfg.demoWeights;
	const weights = {
		clear: dw.clear,
		cloudy: dw.cloudy,
		drizzle: dw.drizzle,
		rain: dw.rain,
		downpour: dw.downpour,
		windy: dw.windy,
		thunderstorm: isNight ? dw.thunderstormNight : dw.thunderstormDay,
		snow: dw.snow,
		snowstorm: dw.snowstorm,
	};
	weights[prev] = 0;
	const total = Object.values(weights).reduce((a, b) => a + b, 0);
	let rand = Math.random() * total;
	for (const [weather, wt] of Object.entries(weights)) {
		rand -= wt;
		if (rand <= 0) return weather;
	}
	return "clear";
}

function smoothToward(smoothed, target, dt, rate) {
	const k = 1 - Math.exp(-rate * dt);
	for (const key of Object.keys(target)) {
		smoothed[key] += (target[key] - smoothed[key]) * k;
	}
}

const _rainColScratch = new THREE.Color();
const _rainDayTint = new THREE.Color();

function windDriftXZ(dt, smoothedWx) {
	const wc = config.weather.windClamp;
	const wcfg = config.weather;
	const sx = THREE.MathUtils.clamp(smoothedWx.windDriftX, -wc, wc);
	const sz = THREE.MathUtils.clamp(smoothedWx.windDriftZ, -wc, wc);
	return { x: sx * dt * wcfg.windDriftMulX, z: sz * dt * wcfg.windDriftMulZ };
}

export function updateWeather(elapsed, dt, dayState, ctx) {
	const now = performance.now();
	const wcfg = config.weather;
	const wx = ctx.weatherState;
	const elapsed_since = now - wx.weatherStartTime;
	const { baselines } = dayState;

	let proc = proceduralSceneTargets(wx.currentWeather);
	if (!wx.liveWeatherActive) {
		proc = applyDemoIntensityBlend(proc, wx.demoIntensity ?? 1);
	}
	const mapLive = wx.latestApiEnv ? mapToSceneWeather(wx.latestApiEnv) : proc;
	const wxTarget = wx.liveWeatherActive && wx.latestApiEnv ? mapLive : proc;
	const windOsc = {
		windDriftX: proc.windStrength * wcfg.windOscXMul * Math.sin(elapsed * wcfg.windOscPhase1 + 0.2),
		windDriftZ: proc.windStrength * wcfg.windOscZMul * Math.cos(elapsed * wcfg.windOscPhase2),
	};
	const apiWind =
		wx.liveWeatherActive && wx.latestApiEnv
			? { windDriftX: wx.latestApiEnv.wind.vector.x, windDriftZ: wx.latestApiEnv.wind.vector.z }
			: windOsc;
	smoothToward(wx.smoothedWx, { ...wxTarget, ...apiWind }, dt, wcfg.smoothRate);
	const w = windDriftXZ(dt, wx.smoothedWx);

	if (wx.liveWeatherActive && ctx.weatherEngine?.lastSuccessTime) {
		const stale = ctx.weatherEngine.isStale() ? " · stale" : "";
		ctx.weatherCountdown.textContent = `Live${stale} · Open-Meteo — tap for demo`;
	} else {
		const remaining = Math.max(0, wcfg.durationMs - elapsed_since);
		const rem_s = Math.ceil(remaining / 1000);
		const rem_m = Math.floor(rem_s / 60);
		const rem_ss = rem_s % 60;
		ctx.weatherCountdown.textContent = `Demo ${rem_m}:${String(rem_ss).padStart(2, "0")} · tap for live`;
	}

	if (!wx.liveWeatherActive && elapsed_since > wcfg.durationMs) {
		wx.lastWeather = wx.currentWeather;
		wx.currentWeather = pickNextWeather(wx.currentWeather);
		wx.weatherStartTime = now;
		wx.weatherTransition = 0;
		setWeatherLabel(ctx.weatherLabel, wx.currentWeather, false, wx.liveWeatherActive);
		setLocationWeatherOverlay(wx.latestApiEnv, wx);
		if (isSnowCategory(wx.lastWeather) && wx.currentWeather === "clear") wx.snowAccumulation = 0;
	}
	wx.weatherTransition = Math.min(1, wx.weatherTransition + dt / wcfg.transitionSeconds);
	const tw = wx.weatherTransition;

	const cloudBoost = wx.smoothedWx.cloudDensity;
	const isDrizzle = wx.currentWeather === "drizzle";
	const isRain = isRainCategory(wx.currentWeather) && wx.smoothedWx.precipIntensity > 0.08;
	const isWind = wx.currentWeather === "windy" || wx.smoothedWx.windStrength > 0.45;
	const isSnow = isSnowCategory(wx.currentWeather) && wx.smoothedWx.precipIntensity > 0.06;
	const isCloud = wx.currentWeather === "cloudy" || cloudBoost > 0.55;
	const isStorm = wx.currentWeather === "thunderstorm" || wx.smoothedWx.thunderActivity > 0.45;
	const isHeavy = isStorm || isSnow || (isRain && !isDrizzle);
	const cloudWindMul = isWind ? wcfg.cloudWindMotionScale : 1;

	const stormCloudTarget = Math.min(0.92, (isCloud || isHeavy ? 0.78 : 0) * tw * (0.55 + cloudBoost * 0.55));
	const cloudCol = isRain || isStorm ? 0x555566 : isSnow ? 0x99aabb : 0x9999aa;
	ctx.stormClouds.forEach((cloud, ci) => {
		cloud.children.forEach((puff) => {
			puff.material.opacity += (stormCloudTarget - puff.material.opacity) * 0.018;
			puff.material.color.setHex(cloudCol);
		});
		const windShift = isWind ? elapsed * cloud.userData.speed * 1.6 * cloudWindMul : 0;
		cloud.position.x =
			cloud.userData.baseX +
			Math.sin(elapsed * cloud.userData.speed * 0.35 + ci) * 7 +
			(windShift % 35) +
			wx.smoothedWx.windDriftX * 0.18 * cloudWindMul;
		cloud.position.z =
			cloud.userData.baseZ + wx.smoothedWx.windDriftZ * 0.14 * cloudWindMul + Math.sin(elapsed * 0.17 + ci) * 1.2;
	});

	const baseCloudDim = isStorm ? Math.min(0.95, 0.3 + cloudBoost * 0.4) : Math.max(0.35, 1 - cloudBoost * 0.35);
	ctx.clouds.forEach((c) =>
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
		if (ctx.scene.background instanceof THREE.Color) {
			ctx.scene.background.lerp(grey, 0.04 * tw * (0.5 + cloudBoost * 0.5));
		}
	}

	const weatherDim = isStorm ? 0.45 : isDrizzle ? 0.85 : isRain ? 0.6 : isCloud ? 0.78 : isSnow ? 0.82 : 1.0;
	const apiDim = 1 - wx.smoothedWx.fogDensity * 0.35;
	const dim = weatherDim * apiDim;

	ctx.ambientLight.intensity = baselines.ambientIntensity * dim;
	ctx.sunLight.intensity = baselines.sunIntensity * dim;
	ctx.sunLight.color.copy(baselines.sunColor);
	ctx.hemisphereLight.intensity = baselines.hemisphereIntensity * dim * (1 - wx.smoothedWx.fogDensity * 0.25);

	const fogD = THREE.MathUtils.clamp(wx.smoothedWx.fogDensity * wcfg.fogDensityScale, 0, wcfg.fogDensityMax);
	ctx.sceneFog.color.copy(ctx.scene.background);
	ctx.sceneFog.density = fogD;

	if (isWind) {
		ctx.clouds.forEach((cloud) => {
			const phase = cloud.userData.startX * 0.31 + cloud.userData.startZ * 0.27;
			const angle = elapsed * cloud.userData.speed * 1.35 * cloudWindMul + phase;
			const radius = 6;
			cloud.position.x =
				cloud.userData.startX + Math.cos(angle) * radius + wx.smoothedWx.windDriftX * 0.12 * cloudWindMul;
			cloud.position.z =
				cloud.userData.startZ + Math.sin(angle) * radius + wx.smoothedWx.windDriftZ * 0.1 * cloudWindMul;
		});
	} else {
		for (const cloud of ctx.clouds) {
			cloud.position.x =
				cloud.userData.startX + Math.sin(elapsed * cloud.userData.speed * 0.4) * 5 + wx.smoothedWx.windDriftX * 0.08;
			cloud.position.z = cloud.userData.startZ + wx.smoothedWx.windDriftZ * 0.06;
		}
	}

	const rainStrength = (isRain ? Math.min(1, tw) : 0) * wx.smoothedWx.precipIntensity;
	const dn = config.dayNight;
	const dayRainBlend = isRain
		? THREE.MathUtils.clamp((dayState.aboveness - dn.abovenessDay) / dn.abovenessTwilight, 0, 1)
		: 0;
	_rainDayTint.setHex(wcfg.rainDayTint);
	ctx.rainDrops.forEach((drop, i) => {
		drop.visible = i < ctx.rainDrops.length * rainStrength;
		if (!isRain || !drop.visible) {
			drop.scale.set(1, 1, 1);
			return;
		}
		_rainColScratch.setHex(config.colors.rain).lerp(_rainDayTint, dayRainBlend * wcfg.rainDayTintMix);
		drop.material.color.copy(_rainColScratch);
		drop.material.opacity = THREE.MathUtils.lerp(wcfg.rainOpacityMin, wcfg.rainOpacityDay, dayRainBlend);
		drop.scale.set(1, THREE.MathUtils.lerp(1, wcfg.rainLineScaleDay, dayRainBlend), 1);
		drop.position.x += (drop.userData.vx + w.x * 0.8) * dt;
		drop.position.y += drop.userData.vy * dt * (isStorm ? 1.5 : 1);
		drop.position.z += (drop.userData.vz + w.z * 0.8) * dt;
		if (drop.position.y < -5) {
			drop.position.set((Math.random() - 0.5) * 30, 14 + Math.random() * 8, (Math.random() - 0.5) * 30);
		}
	});

	ctx.puddleMeshes.forEach((p) => {
		const targetOp = isRain ? 0.4 * tw * wx.smoothedWx.precipIntensity : 0;
		p.mat.opacity += (targetOp - p.mat.opacity) * 0.015;
		p.mesh.visible = p.mat.opacity > 0.01;
		if (p.mesh.visible) {
			const ripple = 1 + 0.07 * Math.sin(elapsed * 2.8 + p.phase);
			p.mesh.scale.setScalar(ripple);
		}
	});

	const leafFraction = (isWind ? Math.min(1, tw) : 0) * Math.min(1, wx.smoothedWx.windStrength * 1.2);

	const trees = ctx.treeMeshes;
	if (trees?.length) {
		const windBlend = (isWind ? Math.min(1, tw) : 0) * Math.min(1, wx.smoothedWx.windStrength * 1.15);
		const maxBend = wcfg.treeWindBendMaxRad * windBlend;
		const wc = wcfg.windClamp;
		const sx = THREE.MathUtils.clamp(wx.smoothedWx.windDriftX / wc, -1, 1);
		const sz = THREE.MathUtils.clamp(wx.smoothedWx.windDriftZ / wc, -1, 1);
		for (const tree of trees) {
			const fol = tree.userData.foliage;
			if (!fol) continue;
			if (ctx.prefersReducedMotion || maxBend < 1e-6) {
				fol.rotation.x = 0;
				fol.rotation.z = 0;
				continue;
			}
			const ud = tree.userData;
			const t = elapsed;
			const mz =
				0.58 * Math.sin(t * ud.swayF1 + ud.swayP1) + 0.42 * Math.sin(t * ud.swayF2 + ud.swayP2);
			const mx =
				0.58 * Math.sin(t * ud.swayF1 * 1.06 + ud.swayP1 + 2.17) +
				0.42 * Math.sin(t * ud.swayF2 * 0.94 + ud.swayP2 + 1.05);
			fol.rotation.z = maxBend * (mz * sx + mx * sz * 0.11);
			fol.rotation.x = maxBend * (-mx * sz + mz * sx * 0.11);
		}
	}

	ctx.leafParticles.forEach((leaf, i) => {
		leaf.visible = i < ctx.leafParticles.length * leafFraction;
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

	const snowStrength = (isSnow ? Math.min(1, tw) : 0) * wx.smoothedWx.precipIntensity;
	ctx.snowFlakes.forEach((flake, i) => {
		flake.visible = i < ctx.snowFlakes.length * snowStrength;
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
		wx.snowAccumulation = Math.min(1, wx.snowAccumulation + dt * wcfg.snowAccumRate * wx.smoothedWx.precipIntensity);
	} else if (wx.currentWeather === "clear" && isSnowCategory(wx.lastWeather)) {
		wx.snowAccumulation = Math.max(0, wx.snowAccumulation - dt * wcfg.snowMeltRate);
	}
	const target = wx.snowAccumulation * wcfg.snowTargetScale;
	const opLerp = wcfg.opacityLerp;
	ctx.snowCovers.forEach((sc) => {
		sc.mat.opacity += (target - sc.mat.opacity) * opLerp;
		sc.mesh.visible = sc.mat.opacity > 0.01;
	});
	if (ctx.cabinSnowMaterial) {
		ctx.cabinSnowMaterial.opacity += (target - ctx.cabinSnowMaterial.opacity) * opLerp;
	}
	ctx.treeSnowMaterials.forEach((mat) => {
		mat.opacity += (target - mat.opacity) * opLerp;
	});

	const tAct = isStorm ? Math.min(1, tw) * wx.smoothedWx.thunderActivity : 0;
	const thunderGap = 2500 + (1.15 - tAct) * 7500;
	if (isStorm && tAct > 0.08 && now > wx.nextThunder) {
		wx.thunderFlash = (2 + Math.random() * 1.8) * (0.35 + tAct * 0.65);
		wx.nextThunder = now + thunderGap * (0.5 + Math.random() * 0.5);
		playThunderRollSfx();
	}
	if (wx.thunderFlash > 0) {
		wx.thunderFlash = Math.max(0, wx.thunderFlash - dt * wcfg.thunderDecay);
		const pulse = 0.65 + Math.sin(elapsed * wcfg.thunderPulseFreq) * 0.28;
		const tScale = 0.4 + tAct * 0.6;
		ctx.thunderLight.intensity = Math.max(0, wx.thunderFlash * 2.4 * pulse * tScale);
		ctx.thunderFill.intensity = Math.max(0, wx.thunderFlash * 1.2 * pulse * tScale);
		if (wx.thunderFlash > 0.6) {
			ctx.ambientLight.intensity = Math.max(ctx.ambientLight.intensity, wx.thunderFlash * 0.22 * tScale);
			ctx.sunLight.intensity = Math.max(ctx.sunLight.intensity, wx.thunderFlash * 0.28 * tScale);
			ctx.hemisphereLight.intensity = Math.max(ctx.hemisphereLight.intensity, wx.thunderFlash * 0.18 * tScale);
			const blueFlash = new THREE.Color(config.colors.thunderBlueFlash);
			if (ctx.scene.background instanceof THREE.Color) ctx.scene.background.lerp(blueFlash, Math.min(0.35, wx.thunderFlash * 0.14));
		}
	} else {
		ctx.thunderLight.intensity = 0;
		ctx.thunderFill.intensity = 0;
	}

	driveWeatherAudio(ctx);
}
