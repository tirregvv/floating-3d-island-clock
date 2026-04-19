import * as THREE from "three";
import * as config from "./config.js";
import { getDayProgress } from "./timeState.js";

const _sunWorldVec = new THREE.Vector3();

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
	const ce = Math.cos(elev);
	const se = Math.sin(elev);
	return {
		x: radius * ce * Math.sin(az),
		y: radius * se,
		z: radius * ce * Math.cos(az) + zBias,
	};
}

export function createSkyPalette() {
	const c = config.colors;
	return {
		dayTop: new THREE.Color(c.daySkyTop),
		dayBot: new THREE.Color(c.daySkyBot),
		sunsetTop: new THREE.Color(c.sunsetSkyTop),
		sunsetBot: new THREE.Color(c.sunsetSkyBot),
		nightTop: new THREE.Color(c.nightSkyTop),
		nightBot: new THREE.Color(c.nightSkyBot),
		daySunCol: new THREE.Color(c.daySun),
		sunsetSunCol: new THREE.Color(c.sunsetSun),
		nightSunCol: new THREE.Color(c.nightSun),
	};
}

export function updateDayNightCycle(ctx) {
	const dn = config.dayNight;
	const cel = config.celestial;
	const t = getDayProgress();
	const omega = (t - 0.5) * Math.PI * 2;
	const declRad = declinationRadFromDate(new Date());
	const latRad = ctx.observerLat.rad;

	const sunAe = bodyAzEl(latRad, declRad, omega);
	const moonAe = bodyAzEl(latRad, declRad, omega + Math.PI);

	const sunP = skyPositionFromAzEl(sunAe.az, sunAe.elev, cel.sunDistance, cel.zBias);
	const moonP = skyPositionFromAzEl(moonAe.az, moonAe.elev, cel.sunDistance, cel.zBias);

	const {
		sunLight,
		sunMesh,
		moonMesh,
		moonLight,
		moonShaderUniforms,
		scene,
		camera,
		starMat,
		windowMat,
		cabinLight,
		lanternGlowMat,
		ambientLight,
		hemisphereLight,
		celestialShell,
		sunMat,
		prefersReducedMotion,
		palette,
	} = ctx;

	sunLight.position.set(sunP.x, sunP.y, sunP.z);
	sunLight.target.position.set(0, 0, 0);
	sunMesh.position.set(sunP.x, sunP.y, sunP.z);
	sunMesh.visible = sunP.y > dn.sunVisibilityY;

	moonMesh.position.set(moonP.x, moonP.y, moonP.z);
	moonLight.position.set(moonP.x, moonP.y, moonP.z);
	moonLight.target.position.set(0, 0, 0);

	_sunWorldVec.set(sunP.x, sunP.y, sunP.z);
	moonShaderUniforms.sunWorldPos.value.copy(_sunWorldVec);
	moonShaderUniforms.cameraWorldPos.value.copy(camera.position);

	const aboveness = Math.sin(sunAe.elev);
	const ad = dn.abovenessDay;
	const tw = dn.abovenessTwilight;
	let skyTop, skyBot, sunCol, intensity, ambInt, starOp;

	if (aboveness > ad) {
		const d = Math.min((aboveness - ad) / tw, 1);
		skyTop = palette.sunsetTop.clone().lerp(palette.dayTop, d);
		skyBot = palette.sunsetBot.clone().lerp(palette.dayBot, d);
		sunCol = palette.sunsetSunCol.clone().lerp(palette.daySunCol, d);
		intensity = 0.8 + d * 0.7;
		ambInt = 0.35 + d * 0.25;
		starOp = 0;
	} else if (aboveness > -ad) {
		const d = (aboveness + ad) / tw;
		skyTop = palette.nightTop.clone().lerp(palette.sunsetTop, d);
		skyBot = palette.nightBot.clone().lerp(palette.sunsetBot, d);
		sunCol = palette.nightSunCol.clone().lerp(palette.sunsetSunCol, d);
		intensity = 0.15 + d * 0.65;
		ambInt = 0.15 + d * 0.2;
		starOp = 1 - d;
	} else {
		skyTop = palette.nightTop.clone();
		skyBot = palette.nightBot.clone();
		sunCol = palette.nightSunCol.clone();
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

	const starTwinkle = prefersReducedMotion ? 0 : dn.starTwinkleCoef * Math.sin(performance.now() * dn.starTwinkleTimeScale);
	starMat.opacity = Math.min(dn.starOpacityCap, starOp * dn.starOpacityBase + starOp * starTwinkle);

	const moonAbove = -aboveness;
	const moonFactor = Math.max(0, Math.min(1, moonAbove / dn.moonFactorDivisor));
	moonMesh.visible = moonP.y > dn.moonVisibilityY;
	moonShaderUniforms.moonBrightness.value = dn.moonBrightnessMin + moonFactor * dn.moonBrightnessRange;
	moonLight.intensity = moonFactor * dn.moonLightIntensityScale;

	const nightFactor = Math.max(0, 1 - (aboveness + ad) / tw);
	windowMat.emissiveIntensity = 0.1 + nightFactor * 1.5;
	windowMat.emissive.setHex(nightFactor > dn.nightWindowThreshold ? dn.windowEmissiveNight : config.colors.windowEmissive);
	cabinLight.intensity = nightFactor * 1.8;
	lanternGlowMat.emissiveIntensity = 0.2 + nightFactor * 2.0;

	celestialShell.rotation.set(-latRad * dn.shellLatFactor - declRad * dn.shellDeclFactor, -omega, 0, "YXZ");

	const baselines = {
		sunIntensity: intensity,
		ambientIntensity: ambInt,
		hemisphereIntensity: ambInt * 0.8,
		sunColor: sunCol.clone(),
		skyTop: skyTop.clone(),
		skyBot: skyBot.clone(),
	};

	return { skyTop, aboveness, baselines, sunAe, omega, declRad, nightFactor };
}
