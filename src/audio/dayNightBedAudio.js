import { getAudioEngine } from "./audioEngine.js";

/**
 * Keeps background bed playlists aligned with the sky (see `dayNight.js` → `nightFactor`).
 *
 * @param {number} nightFactor — 0 day … 1 night
 */
export function syncBackgroundMusicPhase(nightFactor) {
	const engine = getAudioEngine();
	if (!engine) return;
	const nf = typeof nightFactor === "number" && Number.isFinite(nightFactor) ? nightFactor : 0;
	engine.syncBackgroundFromNightFactor(nf);
}
