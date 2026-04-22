import {
	crossfadeSeconds,
	musicPlaylist,
	backgroundMusicPlaylistDay,
	backgroundMusicPlaylistNight,
	backgroundMusicNightEnter,
	backgroundMusicNightExit,
	volumes as defaultVolumes,
	weatherTracks,
	thunderRollUrls,
	thunderVoicePoolSize,
	reducedMotionVolumes,
} from "./audioConfig.js";

/** @typedef {{ master: number; music: number; musicBed: number; weather: number }} VolumeBus */

/** @type {AudioEngine | null} */
let engineInstance = null;

export function getAudioEngine() {
	return engineInstance;
}

/**
 * @param {object} opts
 * @param {boolean} [opts.prefersReducedMotion]
 */
export function initAudioEngine(opts = {}) {
	if (engineInstance) return engineInstance;
	engineInstance = new AudioEngine(opts.prefersReducedMotion === true);
	return engineInstance;
}

function clamp01(x) {
	return Math.min(1, Math.max(0, x));
}

function smoothApplyGain(gainNode, value, audioCtx, timeConstant = 0.04) {
	const v = clamp01(value);
	const t = audioCtx.currentTime;
	gainNode.gain.setTargetAtTime(v, t, timeConstant);
}

/**
 * @param {HTMLMediaElement} el
 * @param {string} path
 */
function audioSrcMatches(el, path) {
	if (!path) return false;
	try {
		const abs = new URL(path, window.location.href).href;
		return el.src === abs || el.src.endsWith(path);
	} catch {
		return el.src.endsWith(path);
	}
}

/**
 * @param {string[]} a
 * @param {string[]} b
 */
function playlistUrlsEqual(a, b) {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) {
		if (a[i] !== b[i]) return false;
	}
	return true;
}

/**
 * Two-voice crossfaded playlist into a single gain node (e.g. music bus or bed stem).
 */
class CrossfadePlaylistDeck {
	/**
	 * @param {string[]} playlistUrls
	 * @param {number} crossfadeSec
	 * @param {string} logPrefix — prefix for warn keys (`music` / `bed`)
	 */
	constructor(playlistUrls, crossfadeSec, logPrefix) {
		this._playlist = playlistUrls.filter((u) => typeof u === "string" && u.length > 0);
		this._crossfadeSec = crossfadeSec;
		this._logPrefix = logPrefix;

		/** @type {AudioContext | null} */
		this._ctx = null;
		/** @type {() => boolean} */
		this._getStarted = () => false;
		/** @param {string} key @param {string} msg */
		this._warnOnce = (key, msg) => console.warn(msg);

		this.elA = document.createElement("audio");
		this.elB = document.createElement("audio");
		this.elA.crossOrigin = "anonymous";
		this.elB.crossOrigin = "anonymous";
		this.elA.preload = "auto";
		this.elB.preload = "auto";

		/** @type {GainNode | null} */
		this.voiceGainA = null;
		/** @type {GainNode | null} */
		this.voiceGainB = null;

		/** @type {'a' | 'b'} */
		this._primary = "a";
		this._index = 0;
		this._crossfadeActive = false;
		/** @type {number | null} */
		this._raf = null;

		this._onPrimaryEnded = () => {
			if (this._crossfadeActive) return;
			this._beginCrossfade();
		};
	}

	get hasTracks() {
		return this._playlist.length > 0;
	}

	/**
	 * @param {string[]} urls
	 * @param {{ crossfade?: boolean }} opts
	 */
	applyPlaylist(urls, opts = {}) {
		const next = urls.filter((u) => typeof u === "string" && u.length > 0);
		if (playlistUrlsEqual(this._playlist, next)) return;

		const crossfade = opts.crossfade === true;
		const prevHadPlaylist = this._playlist.length > 0;
		const primary = this._primaryEl();
		const wasPlaying = Boolean(
			crossfade && this._ctx && prevHadPlaylist && !primary.paused,
		);

		this._playlist = next;
		this._index = 0;

		if (next.length === 0) {
			this._silence();
			return;
		}

		if (wasPlaying) {
			this._runCrossfadeToNext(next[0], 0);
		} else {
			this.cancelMonitor();
			this.startIfNeeded();
		}
	}

	_silence() {
		this.cancelMonitor();
		this._crossfadeActive = false;
		if (!this._ctx || !this.voiceGainA || !this.voiceGainB) return;
		this.elA.pause();
		this.elB.pause();
		const t = this._ctx.currentTime;
		this.voiceGainA.gain.cancelScheduledValues(t);
		this.voiceGainB.gain.cancelScheduledValues(t);
		this.voiceGainA.gain.value = 0;
		this.voiceGainB.gain.value = 0;
	}

	/**
	 * @param {AudioContext} ctx
	 * @param {GainNode} output
	 * @param {() => boolean} getStarted
	 * @param {(key: string, msg: string) => void} warnOnce
	 */
	wire(ctx, output, getStarted, warnOnce) {
		this._ctx = ctx;
		this._getStarted = getStarted;
		this._warnOnce = warnOnce;
		this.voiceGainA = ctx.createGain();
		this.voiceGainB = ctx.createGain();
		this.voiceGainA.connect(output);
		this.voiceGainB.connect(output);
		const srcA = ctx.createMediaElementSource(this.elA);
		const srcB = ctx.createMediaElementSource(this.elB);
		srcA.connect(this.voiceGainA);
		srcB.connect(this.voiceGainB);
		this.voiceGainA.gain.value = 1;
		this.voiceGainB.gain.value = 0;
	}

	_primaryEl() {
		return this._primary === "a" ? this.elA : this.elB;
	}

	_secondaryEl() {
		return this._primary === "a" ? this.elB : this.elA;
	}

	_primaryVoiceGain() {
		return this._primary === "a" ? this.voiceGainA : this.voiceGainB;
	}

	_secondaryVoiceGain() {
		return this._primary === "a" ? this.voiceGainB : this.voiceGainA;
	}

	_advanceIndex() {
		if (this._playlist.length === 0) return;
		this._index = (this._index + 1) % this._playlist.length;
	}

	cancelMonitor() {
		if (this._raf != null) {
			cancelAnimationFrame(this._raf);
			this._raf = null;
		}
	}

	startIfNeeded() {
		if (!this._ctx || this._playlist.length === 0) return;
		this.cancelMonitor();
		const primary = this._primaryEl();
		const gP = this._primaryVoiceGain();
		const gS = this._secondaryVoiceGain();

		const url = this._playlist[this._index];
		if (!url) return;

		const onError = () => {
			this._warnOnce(`${this._logPrefix}:${url}`, `[audio] missing or broken track: ${url}`);
			this._advanceIndex();
			if (this._playlist.length === 0) return;
			this.startIfNeeded();
		};

		gP.gain.cancelScheduledValues(this._ctx.currentTime);
		gS.gain.cancelScheduledValues(this._ctx.currentTime);
		gP.gain.value = 1;
		gS.gain.value = 0;

		const tryPlay = () => {
			primary
				.play()
				.then(() => this._startMonitor())
				.catch((e) => {
					console.warn(`[audio] ${this._logPrefix} play:`, e);
				});
		};

		if (audioSrcMatches(primary, url) && primary.readyState >= 2) {
			primary.currentTime = 0;
			tryPlay();
			return;
		}

		primary.removeEventListener("error", onError);
		primary.addEventListener(
			"error",
			() => {
				onError();
			},
			{ once: true },
		);
		primary.src = url;
		primary.load();
		const onReady = () => {
			primary.removeEventListener("canplay", onReady);
			tryPlay();
		};
		primary.addEventListener("canplay", onReady, { once: true });
	}

	_startMonitor() {
		this.cancelMonitor();
		const tick = () => {
			this._raf = requestAnimationFrame(tick);
			if (!this._getStarted() || !this._ctx || this._playlist.length === 0) return;
			if (this._crossfadeActive) return;

			const el = this._primaryEl();
			const dur = el.duration;
			if (!dur || !Number.isFinite(dur) || dur <= 0) return;

			const remain = dur - el.currentTime;
			if (remain <= this._crossfadeSec + 0.08) {
				this._beginCrossfade();
			}
		};
		this._raf = requestAnimationFrame(tick);

		const primary = this._primaryEl();
		primary.removeEventListener("ended", this._onPrimaryEnded);
		primary.addEventListener("ended", this._onPrimaryEnded);
	}

	_beginCrossfade() {
		if (!this._ctx || this._playlist.length === 0 || this._crossfadeActive) return;
		const nextIndex = (this._index + 1) % this._playlist.length;
		const nextUrl = this._playlist[nextIndex];
		if (!nextUrl) return;
		this._runCrossfadeToNext(nextUrl, nextIndex);
	}

	/**
	 * @param {string} nextUrl
	 * @param {number} indexAfter — playlist index for the incoming track
	 */
	_runCrossfadeToNext(nextUrl, indexAfter) {
		if (!this._ctx || this._crossfadeActive) return;
		this._crossfadeActive = true;

		const primaryEl = this._primaryEl();
		const secondaryEl = this._secondaryEl();
		const gP = this._primaryVoiceGain();
		const gS = this._secondaryVoiceGain();
		const t0 = this._ctx.currentTime;
		const T = this._crossfadeSec;

		const onSecondaryError = () => {
			this._warnOnce(`${this._logPrefix}:${nextUrl}`, `[audio] missing or broken track: ${nextUrl}`);
			this._crossfadeActive = false;
			this._advanceIndex();
			this.startIfNeeded();
		};

		const runFade = () => {
			secondaryEl.currentTime = 0;
			secondaryEl
				.play()
				.then(() => {
					gP.gain.cancelScheduledValues(t0);
					gS.gain.cancelScheduledValues(t0);
					gP.gain.setValueAtTime(gP.gain.value, t0);
					gS.gain.setValueAtTime(gS.gain.value, t0);
					gP.gain.linearRampToValueAtTime(0, t0 + T);
					gS.gain.linearRampToValueAtTime(1, t0 + T);

					window.setTimeout(() => {
						primaryEl.pause();
						this._primary = this._primary === "a" ? "b" : "a";
						this._index = indexAfter;
						this._crossfadeActive = false;
						const nowT = this._ctx.currentTime;
						this._primaryVoiceGain().gain.cancelScheduledValues(nowT);
						this._secondaryVoiceGain().gain.cancelScheduledValues(nowT);
						this._primaryVoiceGain().gain.value = 1;
						this._secondaryVoiceGain().gain.value = 0;
						this._startMonitor();
					}, T * 1000 + 50);
				})
				.catch((e) => {
					console.warn(`[audio] ${this._logPrefix} crossfade play:`, e);
					this._crossfadeActive = false;
				});
		};

		if (audioSrcMatches(secondaryEl, nextUrl) && secondaryEl.readyState >= 2) {
			runFade();
			return;
		}

		secondaryEl.removeEventListener("error", onSecondaryError);
		secondaryEl.addEventListener("error", onSecondaryError, { once: true });
		secondaryEl.src = nextUrl;
		secondaryEl.load();
		secondaryEl.addEventListener("canplay", runFade, { once: true });
	}
}

class AudioEngine {
	/**
	 * @param {boolean} reducedMotion
	 */
	constructor(reducedMotion) {
		/** @type {AudioContext | null} */
		this.ctx = null;
		this.reducedMotion = reducedMotion;
		this.started = false;

		/** @type {VolumeBus} */
		this._bus = reducedMotion
			? { ...reducedMotionVolumes }
			: { ...defaultVolumes };

		/** @type {GainNode | null} */
		this.masterGain = null;
		/** Main theme playlist → master (gain = `volumes.music`). */
		this.themeGain = null;
		/** Background bed playlists → master (gain = `volumes.musicBed`). */
		this.bedStemGain = null;
		/** @type {GainNode | null} */
		this.weatherGain = null;

		const xfSec = Math.min(60, Math.max(0.25, crossfadeSeconds));
		this._mainDeck = new CrossfadePlaylistDeck(musicPlaylist, xfSec, "music");

		const bedDay = backgroundMusicPlaylistDay.filter((u) => typeof u === "string" && u.length > 0);
		const bedNight = backgroundMusicPlaylistNight.filter((u) => typeof u === "string" && u.length > 0);
		const hasBedTracks = bedDay.length > 0 || bedNight.length > 0;
		this._bedDeck = hasBedTracks ? new CrossfadePlaylistDeck([], xfSec, "bed") : null;
		/** @type {boolean} */
		this._bedPhaseInited = false;
		/** @type {boolean} */
		this._bedIsNight = false;

		this._warnedMissing = new Set();

		/** @type {Map<string, { el: HTMLAudioElement; layerGain: GainNode }>} */
		this._weatherLayers = new Map();

		/** @type {{ el: HTMLAudioElement }[]} */
		this._thunderVoices = [];
		this._thunderVoiceIndex = 0;
		/** @type {string[]} */
		this._thunderClipUrls = [];
	}

	/**
	 * @returns {VolumeBus}
	 */
	getVolumes() {
		return { ...this._bus };
	}

	/**
	 * @param {Partial<VolumeBus>} v
	 */
	setVolumes(v) {
		if (v.master != null) this._bus.master = clamp01(v.master);
		if (v.music != null) this._bus.music = clamp01(v.music);
		if (v.musicBed != null) this._bus.musicBed = clamp01(v.musicBed);
		if (v.weather != null) this._bus.weather = clamp01(v.weather);
		if (!this.ctx || !this.masterGain) return;
		const t = this.ctx.currentTime;
		this.masterGain.gain.setTargetAtTime(this._bus.master, t, 0.03);
		if (this.themeGain) {
			this.themeGain.gain.setTargetAtTime(this._bus.music, t, 0.03);
		}
		if (this.bedStemGain) {
			this.bedStemGain.gain.setTargetAtTime(this._bus.musicBed, t, 0.03);
		}
		this.weatherGain.gain.setTargetAtTime(this._bus.weather, t, 0.03);
	}

	_warnOnce(key, msg) {
		if (this._warnedMissing.has(key)) return;
		this._warnedMissing.add(key);
		console.warn(msg);
	}

	_ensureGraph() {
		if (this.ctx) return;
		const AC = window.AudioContext || window.webkitAudioContext;
		if (!AC) {
			console.warn("[audio] Web Audio API not available");
			return;
		}
		this.ctx = new AC();
		this.masterGain = this.ctx.createGain();
		this.themeGain = this.ctx.createGain();
		this.weatherGain = this.ctx.createGain();

		this.masterGain.connect(this.ctx.destination);
		this.themeGain.connect(this.masterGain);
		this.weatherGain.connect(this.masterGain);

		const getStarted = () => this.started;
		const warn = (k, m) => this._warnOnce(k, m);

		this._mainDeck.wire(this.ctx, this.themeGain, getStarted, warn);

		if (this._bedDeck) {
			this.bedStemGain = this.ctx.createGain();
			this.bedStemGain.connect(this.masterGain);
			this.bedStemGain.gain.value = this._bus.musicBed;
			this._bedDeck.wire(this.ctx, this.bedStemGain, getStarted, warn);
		}

		this.masterGain.gain.value = this._bus.master;
		this.themeGain.gain.value = this._bus.music;
		this.weatherGain.gain.value = this._bus.weather;

		this._buildWeatherLayers();
		this._buildThunderPool();
	}

	_buildThunderPool() {
		if (!this.ctx || !this.weatherGain) return;
		this._thunderClipUrls = thunderRollUrls.filter((u) => typeof u === "string" && u.length > 0);
		if (this._thunderClipUrls.length === 0) return;
		const clips = this._thunderClipUrls;
		let n = thunderVoicePoolSize;
		if (!Number.isFinite(n) || n < 1) n = 1;
		n = Math.min(12, Math.floor(n));
		for (let i = 0; i < n; i++) {
			const el = document.createElement("audio");
			el.crossOrigin = "anonymous";
			el.loop = false;
			el.preload = "auto";
			el.src = clips[i % clips.length];
			const voiceGain = this.ctx.createGain();
			voiceGain.gain.value = 1;
			try {
				const mes = this.ctx.createMediaElementSource(el);
				mes.connect(voiceGain);
				voiceGain.connect(this.weatherGain);
				this._thunderVoices.push({ el });
			} catch (e) {
				console.warn("[audio] thunder pool voice failed:", e);
			}
		}
	}

	playThunderRoll() {
		const urls = this._thunderClipUrls;
		if (!this.started || !this.ctx || this._thunderVoices.length === 0 || urls.length === 0) return;
		const url = urls[Math.floor(Math.random() * urls.length)];
		const v = this._thunderVoices[this._thunderVoiceIndex % this._thunderVoices.length];
		this._thunderVoiceIndex++;
		const el = v.el;

		const playFromStart = () => {
			el.currentTime = 0;
			el.play().catch(() => {
				/* ignore */
			});
		};

		if (audioSrcMatches(el, url)) {
			playFromStart();
			return;
		}

		el.src = url;
		el.load();
		const onReady = () => {
			el.removeEventListener("canplay", onReady);
			playFromStart();
		};
		el.addEventListener("canplay", onReady, { once: true });
	}

	_buildWeatherLayers() {
		if (!this.ctx) return;
		for (const [name, url] of Object.entries(weatherTracks)) {
			if (!url || typeof url !== "string") continue;
			if (this._weatherLayers.has(name)) continue;
			const el = document.createElement("audio");
			el.crossOrigin = "anonymous";
			el.loop = true;
			el.preload = "auto";
			el.src = url;
			const layerGain = this.ctx.createGain();
			layerGain.gain.value = 0;
			try {
				const mes = this.ctx.createMediaElementSource(el);
				mes.connect(layerGain);
				layerGain.connect(this.weatherGain);
				this._weatherLayers.set(name, { el, layerGain });
			} catch (e) {
				console.warn(`[audio] weather layer "${name}" failed:`, e);
			}
		}
	}

	async resumeAndStart() {
		this._ensureGraph();
		if (!this.ctx) return false;
		if (this.ctx.state === "suspended") await this.ctx.resume();
		this.started = true;
		this._mainDeck.startIfNeeded();
		this._bedPhaseInited = false;
		this._startWeatherLoops();
		return true;
	}

	/**
	 * @param {boolean} isNight
	 * @returns {string[]}
	 */
	_resolveBedPlaylist(isNight) {
		const day = backgroundMusicPlaylistDay.filter((u) => typeof u === "string" && u.length > 0);
		const night = backgroundMusicPlaylistNight.filter((u) => typeof u === "string" && u.length > 0);
		if (isNight) {
			if (night.length > 0) return night;
			return day;
		}
		if (day.length > 0) return day;
		return night;
	}

	/**
	 * Call each frame with `dayState.nightFactor` (0 … 1) so background beds follow day/night.
	 *
	 * @param {number} nightFactor
	 */
	syncBackgroundFromNightFactor(nightFactor) {
		if (!this._bedDeck || !this.started) return;

		if (!this._bedPhaseInited) {
			const wantNight = nightFactor >= backgroundMusicNightEnter;
			this._bedPhaseInited = true;
			this._bedIsNight = wantNight;
			this._bedDeck.applyPlaylist(this._resolveBedPlaylist(wantNight), { crossfade: false });
			this._bedDeck.startIfNeeded();
			return;
		}

		let wantNight = this._bedIsNight;
		if (this._bedIsNight) {
			if (nightFactor <= backgroundMusicNightExit) wantNight = false;
		} else {
			if (nightFactor >= backgroundMusicNightEnter) wantNight = true;
		}

		if (wantNight === this._bedIsNight) return;

		this._bedIsNight = wantNight;
		this._bedDeck.applyPlaylist(this._resolveBedPlaylist(wantNight), { crossfade: true });
	}

	_startWeatherLoops() {
		for (const { el } of this._weatherLayers.values()) {
			el.play().catch(() => {
				/* often blocked until resume; retry is harmless */
			});
		}
	}

	/**
	 * @param {Record<string, number>} levels — layer name → 0..1
	 */
	updateWeatherLayers(levels) {
		if (!this.ctx) return;
		for (const [name, { layerGain }] of this._weatherLayers) {
			const raw = levels[name];
			smoothApplyGain(layerGain, raw == null ? 0 : raw, this.ctx, 0.06);
		}
	}
}
