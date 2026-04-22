/**
 * Audio tweakables: add theme tracks to `musicPlaylist` (any length, loops forever).
 * Put files under public/audio/... — URLs are site-root paths (Vite serves public/ at /).
 *
 * Effective loudness: main themes ≈ master × `music`; background beds ≈ master × `musicBed`;
 * weather ≈ master × `weather` × per-layer automations.
 */

/** Primary themes — crossfaded playlist into the music bus. */
export const musicPlaylist = [
	// Example (uncomment when you add files):
	// "/audio/music/theme-01.mp3",
	// "/audio/music/theme-02.mp3",
	"/audio/music/candlewood-study-hall.mp3",
];

/**
 * Background beds by time of day (uses scene `nightFactor`: 0 = day, 1 = deep night).
 * Each list crossfades internally; switching day↔night crossfades between lists.
 * If the active list is empty, the other list is used as fallback.
 * Paths: e.g. `public/audio/background/`.
 */
export const backgroundMusicPlaylistDay = [
	// "/audio/background/birds-day.mp3",
	"/audio/background/birds-day.mp3",
];

export const backgroundMusicPlaylistNight = [
	// "/audio/background/wolves-night.mp3",
	"/audio/background/crickets-night.mp3",
];

/**
 * Hysteresis on `nightFactor` so twilight does not flip audio every frame.
 * Enter night when nightFactor >= nightEnter; leave night when nightFactor <= nightExit.
 */
export const backgroundMusicNightEnter = 0.52;
export const backgroundMusicNightExit = 0.35;

/** Crossfade duration when advancing to the next playlist item (also softens single-track loops). */
export const crossfadeSeconds = 3;

/** Default bus levels 0–1; UI / localStorage can override after first load. */
export const volumes = {
	master: 0.85,
	/** Main `musicPlaylist` only (does not affect day/night beds). */
	music: 0.55,
	/** `backgroundMusicPlaylistDay` / `Night` only (independent of `music`). */
	musicBed: 0.45,
	weather: 0.5,
};

/**
 * Weather beds: optional layer keys → file URL. Empty string / omit = unused.
 * Layers are mixed by `weatherAudio.js` from scene smoothed weather.
 */
export const weatherTracks = {
	rain: "/audio/weather/rain.mp3",
	wind: "/audio/weather/wind.mp3",
};

/**
 * One-shot thunder clips (not in `weatherTracks`). Each strike picks one at random.
 * Overlapping strikes use a voice pool (`thunderVoicePoolSize`).
 */
export const thunderRollUrls = [
	"/audio/weather/thunder-1.mp3",
	"/audio/weather/thunder-2.mp3",
	"/audio/weather/thunder-3.mp3",
	"/audio/weather/thunder-4.mp3",
	"/audio/weather/thunder-5.mp3",
];

/** How many thunder voices to rotate for overlapping rolls during storms. */
export const thunderVoicePoolSize = 5;

/** If true, show the tap-to-start gate on every page load. */
export const alwaysShowStartGate = false;

/**
 * sessionStorage key: after first successful unlock, refresh may auto-start (best-effort).
 */
export const audioUnlockStorageKey = "floating-island-audio-unlocked";

/** localStorage key for mixer slider values. */
export const audioMixerStorageKey = "floating-island-audio-mixer";

/** When prefers-reduced-motion, replace `volumes` with these before UI merge. */
export const reducedMotionVolumes = {
	master: 0.5,
	music: 0.2,
	musicBed: 0.12,
	weather: 0.15,
};
