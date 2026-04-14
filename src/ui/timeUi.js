import * as config from "../config.js";
import { getDisplayTime, syncSliderToRealTime, onSliderInput, getSimulatedDayFraction } from "../timeState.js";

export function bindTimeUi(timeSlider, resetBtn) {
	syncSliderToRealTime(timeSlider);
	timeSlider.addEventListener("input", () => onSliderInput(timeSlider));
	resetBtn.addEventListener("click", () => syncSliderToRealTime(timeSlider));

	function updateTimeUI() {
		const { h, m, s } = getDisplayTime();
		const pad = (n) => String(n).padStart(2, "0");
		document.getElementById("time-display").textContent = `${pad(h)}:${pad(m)}:${pad(s)}`;
		const now = new Date();
		document.getElementById("date-display").textContent = `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()}`;
		if (getSimulatedDayFraction() === null) timeSlider.value = now.getHours() * 60 + now.getMinutes();
	}

	setInterval(updateTimeUI, config.timeUi.updateIntervalMs);
	updateTimeUI();
}
