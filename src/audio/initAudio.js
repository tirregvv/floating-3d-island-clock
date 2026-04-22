import { initAudioEngine } from "./audioEngine.js";
import * as audioConfig from "./audioConfig.js";
import { bindAudioStartGate } from "../ui/audioOverlay.js";
import { bindAudioMixer } from "../ui/audioMixer.js";

/**
 * @returns {Partial<{ master: number; music: number; musicBed: number; weather: number }> | null}
 */
function readStoredVolumes() {
	try {
		const raw = localStorage.getItem(audioConfig.audioMixerStorageKey);
		if (!raw) return null;
		const o = JSON.parse(raw);
		/** @type {Partial<{ master: number; music: number; musicBed: number; weather: number }>} */
		const out = {};
		if (typeof o.master === "number") out.master = o.master;
		if (typeof o.music === "number") out.music = o.music;
		if (typeof o.musicBed === "number") out.musicBed = o.musicBed;
		if (typeof o.weather === "number") out.weather = o.weather;
		return Object.keys(out).length ? out : null;
	} catch {
		return null;
	}
}

/**
 * @param {boolean} prefersReducedMotion
 */
export function initAudio(prefersReducedMotion) {
	const engine = initAudioEngine({ prefersReducedMotion });
	const stored = readStoredVolumes();
	if (stored) engine.setVolumes(stored);

	const audioDialog = document.getElementById("audio-dialog");
	const audioToggle = document.getElementById("audio-toggle");
	const audioDialogClose = document.getElementById("audio-dialog-close");
	const masterSlider = document.getElementById("audio-slider-master");
	const musicSlider = document.getElementById("audio-slider-music");
	const musicBedSlider = document.getElementById("audio-slider-music-bed");
	const weatherSlider = document.getElementById("audio-slider-weather");

	if (
		audioDialog &&
		audioToggle &&
		audioDialogClose &&
		masterSlider &&
		musicSlider &&
		musicBedSlider &&
		weatherSlider
	) {
		bindAudioMixer({
			dialog: audioDialog,
			openButton: audioToggle,
			closeButton: audioDialogClose,
			masterSlider,
			musicSlider,
			musicBedSlider,
			weatherSlider,
		});
	}

	const overlay = document.getElementById("audio-start-overlay");
	const startBtn = document.getElementById("audio-start-btn");
	if (overlay && startBtn) {
		bindAudioStartGate({ overlay, button: startBtn, engine });
	}
}
