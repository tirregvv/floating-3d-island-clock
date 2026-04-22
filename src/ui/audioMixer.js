import { audioMixerStorageKey } from "../audio/audioConfig.js";
import { getAudioEngine } from "../audio/audioEngine.js";

/**
 * @param {object} p
 * @param {HTMLDialogElement} p.dialog
 * @param {HTMLButtonElement} p.openButton
 * @param {HTMLButtonElement} p.closeButton
 * @param {HTMLInputElement} p.masterSlider
 * @param {HTMLInputElement} p.musicSlider
 * @param {HTMLInputElement} p.musicBedSlider
 * @param {HTMLInputElement} p.weatherSlider
 */
export function bindAudioMixer({
	dialog,
	openButton,
	closeButton,
	masterSlider,
	musicSlider,
	musicBedSlider,
	weatherSlider,
}) {
	function persist() {
		const engine = getAudioEngine();
		if (!engine) return;
		try {
			localStorage.setItem(audioMixerStorageKey, JSON.stringify(engine.getVolumes()));
		} catch {
			/* ignore quota / private mode */
		}
	}

	function syncSliders() {
		const engine = getAudioEngine();
		if (!engine) return;
		const v = engine.getVolumes();
		masterSlider.value = String(v.master);
		musicSlider.value = String(v.music);
		musicBedSlider.value = String(v.musicBed);
		weatherSlider.value = String(v.weather);
	}

	function onInput() {
		const engine = getAudioEngine();
		if (!engine) return;
		engine.setVolumes({
			master: parseFloat(masterSlider.value),
			music: parseFloat(musicSlider.value),
			musicBed: parseFloat(musicBedSlider.value),
			weather: parseFloat(weatherSlider.value),
		});
		persist();
	}

	function setOpenAria(on) {
		openButton.setAttribute("aria-expanded", String(on));
	}

	openButton.addEventListener("click", () => {
		if (dialog.open) return;
		syncSliders();
		dialog.showModal();
		setOpenAria(true);
	});

	closeButton.addEventListener("click", () => dialog.close());

	dialog.addEventListener("close", () => setOpenAria(false));

	masterSlider.addEventListener("input", onInput);
	musicSlider.addEventListener("input", onInput);
	musicBedSlider.addEventListener("input", onInput);
	weatherSlider.addEventListener("input", onInput);

	function onFullscreenMaybeChange() {
		const el = document.fullscreenElement ?? document.webkitFullscreenElement;
		if (el != null && dialog.open) dialog.close();
	}

	document.addEventListener("fullscreenchange", onFullscreenMaybeChange);
	document.addEventListener("webkitfullscreenchange", onFullscreenMaybeChange);
}
