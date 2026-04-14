import * as THREE from "three";
import * as config from "./config.js";
import { updateDayNightCycle } from "./dayNight.js";
import { updateWeather } from "./weather/updateWeather.js";

export function startAnimationLoop({
	islandGroup,
	clouds,
	updateFallingStars,
	dayNightCtx,
	moonShaderUniforms,
	weatherCtx,
	cabinLight,
	controls,
	camera,
	renderer,
	scene,
}) {
	const timer = new THREE.Timer();
	const anim = config.animation;

	function animate() {
		timer.update();
		const elapsed = timer.getElapsed();
		const dt = Math.min(timer.getDelta(), anim.maxDelta);

		islandGroup.rotation.y = elapsed * anim.islandRotationSpeed;

		updateFallingStars(dt);

		for (const cloud of clouds) {
			cloud.position.y += Math.sin(elapsed * anim.cloudBobPhase + cloud.userData.startX) * anim.cloudBobFactor;
		}

		const dayState = updateDayNightCycle(dayNightCtx);
		moonShaderUniforms.uTime.value = elapsed;
		updateWeather(elapsed, dt, dayState, weatherCtx);

		const flicker =
			1 +
			Math.sin(elapsed * anim.cabinFlickerA) * anim.cabinFlickerAmp1 +
			Math.sin(elapsed * anim.cabinFlickerB) * anim.cabinFlickerAmp2;
		cabinLight.intensity *= flicker;

		controls.update();
		renderer.render(scene, camera);
	}

	renderer.setAnimationLoop(animate);
}
