import * as THREE from "three";
import * as config from "./config.js";

export function createMainLights(scene, renderStyle) {
	const L = config.lights;
	const ambientLight = new THREE.AmbientLight(
		L.ambientColor,
		renderStyle.boostedFillLighting ? L.ambientIntensityMobile : L.ambientIntensityDesktop,
	);
	scene.add(ambientLight);
	const sunLight = new THREE.DirectionalLight(L.sunColor, L.sunIntensity);
	sunLight.castShadow = true;
	const sunShadowSz = renderStyle.compactShadowMaps ? L.sunShadowMapSizeMobile : L.sunShadowMapSize;
	sunLight.shadow.mapSize.set(sunShadowSz, sunShadowSz);
	sunLight.shadow.camera.left = -15;
	sunLight.shadow.camera.right = 15;
	sunLight.shadow.camera.top = 15;
	sunLight.shadow.camera.bottom = -15;
	sunLight.shadow.camera.near = 0.5;
	sunLight.shadow.camera.far = 55;
	sunLight.shadow.bias = -0.001;
	sunLight.shadow.normalBias = 0.02;
	if (!renderStyle.shadowMapsEnabled) sunLight.castShadow = false;
	scene.add(sunLight);
	const hemisphereLight = new THREE.HemisphereLight(
		L.hemisphereSky,
		L.hemisphereGround,
		renderStyle.boostedFillLighting ? L.hemisphereIntensityMobile : L.hemisphereIntensityDesktop,
	);
	scene.add(hemisphereLight);

	return { ambientLight, sunLight, hemisphereLight };
}
