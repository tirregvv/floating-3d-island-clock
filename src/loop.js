import * as THREE from "three";
import * as config from "./config.js";
import { updateDayNightCycle } from "./dayNight.js";
import { updateWeather } from "./weather/updateWeather.js";
import { syncBackgroundMusicPhase } from "./audio/dayNightBedAudio.js";

export function startAnimationLoop({
	islandGroup,
	clouds,
	updateFallingStars,
	dayNightCtx,
	moonShaderUniforms,
	weatherCtx,
	cabinLight,
	fireflies,
	prefersReducedMotion = false,
	controls,
	camera,
	renderer,
	scene,
	embeddedDisplay = false,
	afterRender = null,
}) {
	const timer = new THREE.Timer();
	const anim = config.animation;
	const tvAnim = embeddedDisplay ? config.embeddedDisplayAnimation : null;
	const motionScale = tvAnim ? tvAnim.motionScale : 1;
	const cloudBobScale = tvAnim ? tvAnim.cloudBobScale : 1;

	function animate() {
		timer.update();
		const elapsed = timer.getElapsed();
		const dt = Math.min(timer.getDelta(), anim.maxDelta);

		islandGroup.rotation.y = elapsed * anim.islandRotationSpeed * motionScale;

		updateFallingStars(dt);

		const bob = anim.cloudBobFactor * cloudBobScale;
		for (const cloud of clouds) {
			cloud.position.y += Math.sin(elapsed * anim.cloudBobPhase + cloud.userData.startX) * bob;
		}

		const dayState = updateDayNightCycle(dayNightCtx);
		syncBackgroundMusicPhase(dayState.nightFactor ?? 0);
		moonShaderUniforms.uTime.value = elapsed;
		updateWeather(elapsed, dt, dayState, weatherCtx);

		if (fireflies) {
			fireflies.update(dt, elapsed, dayState.nightFactor ?? 0, prefersReducedMotion);
		}

		const flicker =
			1 +
			Math.sin(elapsed * anim.cabinFlickerA) * anim.cabinFlickerAmp1 +
			Math.sin(elapsed * anim.cabinFlickerB) * anim.cabinFlickerAmp2;
		cabinLight.intensity *= flicker;

		controls.update();
		renderer.render(scene, camera);
		if (afterRender) afterRender(renderer, scene);
	}

	renderer.setAnimationLoop(animate);
}
