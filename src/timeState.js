import * as config from "./config.js";

let simulatedDayFraction = null;

export function getSimulatedDayFraction() {
	return simulatedDayFraction;
}

export function setSimulatedDayFraction(v) {
	simulatedDayFraction = v;
}

export function getDayProgress() {
	if (simulatedDayFraction !== null) return simulatedDayFraction;
	const now = new Date();
	return (now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()) / 86400;
}

export function getDisplayTime() {
	const frac = getDayProgress();
	const totalSeconds = Math.round(frac * 86400);
	const h = Math.floor(totalSeconds / 3600) % 24;
	const m = Math.floor((totalSeconds % 3600) / 60);
	const s = totalSeconds % 60;
	return { h, m, s };
}

export function syncSliderToRealTime(timeSlider) {
	const now = new Date();
	timeSlider.value = now.getHours() * 60 + now.getMinutes();
	simulatedDayFraction = null;
}

export function onSliderInput(timeSlider) {
	simulatedDayFraction = parseInt(timeSlider.value, 10) / config.timeUi.sliderMax;
}
