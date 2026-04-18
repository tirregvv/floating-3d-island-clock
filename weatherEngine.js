/**
 * Open-Meteo client for live weather. Forecast data: https://open-meteo.com/
 */

import { weatherApi, weatherRules } from "./src/config.js";

async function fetchPlaceName(lat, lon, signal) {
	const url =
		`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${encodeURIComponent(lat)}` +
		`&longitude=${encodeURIComponent(lon)}&localityLanguage=en`;
	const res = await fetch(url, { signal });
	if (!res.ok) return null;
	let data;
	try {
		data = await res.json();
	} catch {
		return null;
	}
	const name = data.city || data.locality || data.principalSubdivision;
	return typeof name === "string" && name.trim() ? name.trim() : null;
}

function hourlyIndexForTime(hourlyTimes, currentIso) {
	if (!hourlyTimes?.length) return 0;
	let best = 0;
	let bestDiff = Infinity;
	const t0 = Date.parse(currentIso);
	if (Number.isNaN(t0)) return 0;
	for (let i = 0; i < hourlyTimes.length; i++) {
		const d = Math.abs(Date.parse(hourlyTimes[i]) - t0);
		if (d < bestDiff) {
			bestDiff = d;
			best = i;
		}
	}
	return best;
}

function computeMoonPhase(date) {
	const synodicMonth = 29.53058867;
	const knownNewMoon = new Date("2000-01-06T18:14:00Z");
	const days = (date - knownNewMoon) / (1000 * 60 * 60 * 24);
	return ((days % synodicMonth) + synodicMonth) % synodicMonth / synodicMonth;
}

export function mapToSceneWeather(env) {
	const code = env?.weather?.code ?? 0;
	const temp = env?.weather?.temperature ?? 10;
	const windSpeed = env?.wind?.speed ?? 0;
	const cloudD = env?.clouds?.density ?? 0;
	const fogD = env?.fog?.density ?? 0;
	const thunder = env?.thunder ?? { active: false, probability: 0 };

	let category = "clear";
	let precipIntensity = 0;

	const r = weatherRules;

	if (r.thunderCodes.includes(code) || thunder.active) {
		category = "thunderstorm";
		precipIntensity = 0.75 + thunder.probability * 0.25;
	} else if (
		r.snowCodes.includes(code) ||
		(temp < r.snowTempThreshold && (r.rainLight.includes(code) || r.rainHeavy.includes(code)))
	) {
		const coldHeavyRain = temp < r.snowTempThreshold && r.rainHeavy.includes(code);
		const heavySnow = r.snowHeavyCodes.includes(code) || coldHeavyRain;
		category = heavySnow ? "snowstorm" : "snow";
		if (category === "snowstorm") {
			precipIntensity = r.snowCodes.includes(code) ? 0.88 : 0.72;
		} else {
			precipIntensity = r.snowCodes.includes(code) ? 0.48 : 0.4;
		}
	} else if (r.rainHeavy.includes(code)) {
		category = "downpour";
		precipIntensity = 0.92;
	} else if (r.rainLight.includes(code)) {
		if (r.drizzleCodes.includes(code)) {
			category = "drizzle";
			precipIntensity = 0.32;
		} else {
			category = "rain";
			precipIntensity = code >= 66 ? 0.62 : code >= 61 ? 0.55 : 0.4;
		}
	} else if (code >= r.cloudyCodeMin && code <= r.cloudyCodeMax) {
		category = "cloudy";
		precipIntensity = 0;
	} else if (windSpeed > r.windSpeedWindy) {
		category = "windy";
		precipIntensity = 0;
	} else {
		category = "clear";
	}

	const windStrength = Math.min(1, windSpeed / r.windStrengthDivisor);
	const cloudDensity = Math.min(
		1,
		cloudD +
			(category === "cloudy" ? 0.25 : 0) +
			(category === "thunderstorm" ? 0.15 : 0) +
			(category === "downpour" ? 0.12 : 0) +
			(category === "snowstorm" ? 0.1 : 0) +
			(category === "drizzle" ? 0.06 : 0),
	);
	const thunderActivity = thunder.active ? 0.65 + thunder.probability * 0.35 : thunder.probability * 0.35;

	return {
		category,
		cloudDensity,
		fogDensity: Math.min(1, fogD),
		precipIntensity: Math.min(1, precipIntensity),
		thunderActivity: Math.min(1, thunderActivity),
		windStrength,
	};
}

export default class WeatherEngine {
	constructor({
		interval = weatherApi.intervalMs,
		onUpdate = () => {},
		onError = () => {},
		smoothing = weatherApi.smoothing,
		fallbackCoords = weatherApi.fallbackCoords,
		geolocationTimeoutMs = weatherApi.geolocationTimeoutMs,
		geolocationQuickTimeoutMs = weatherApi.geolocationQuickTimeoutMs,
		geolocationQuickMaxAgeMs = weatherApi.geolocationQuickMaxAgeMs,
		staleMs = weatherApi.staleMs,
		backoffStepsMs = weatherApi.backoffStepsMs,
	} = {}) {
		this.baseInterval = interval;
		this.interval = interval;
		this.onUpdate = onUpdate;
		this.onError = onError;
		this.smoothing = smoothing;
		this.fallbackCoords = fallbackCoords;
		this.geolocationTimeoutMs = geolocationTimeoutMs;
		this.geolocationQuickTimeoutMs = geolocationQuickTimeoutMs;
		this.geolocationQuickMaxAgeMs = geolocationQuickMaxAgeMs;
		this.staleMs = staleMs;
		this.backoffStepsMs = backoffStepsMs;

		this.coords = null;
		this.timer = null;
		this.isRunning = false;
		this.abortController = null;
		this.consecutiveErrors = 0;
		this.lastSuccessTime = 0;
		this.lastEnv = null;
		this.visibilityHandler = this._onVisibilityChange.bind(this);
		this.pausedWhileHidden = false;

		this.wind = { x: 0, z: 0 };
		this.coordsFromDevice = false;
		this.placeName = null;
	}

	async start() {
		if (this.isRunning) return;
		this.isRunning = true;
		this.consecutiveErrors = 0;
		this.interval = this.baseInterval;
		document.addEventListener("visibilitychange", this.visibilityHandler);

		try {
			await this._getLocation();
			await this._update();

			this._scheduleNextTick();
		} catch (err) {
			this.onError(err);
			this._scheduleNextTick();
		}
	}

	stop() {
		this.isRunning = false;
		document.removeEventListener("visibilitychange", this.visibilityHandler);
		if (this.timer) {
			clearTimeout(this.timer);
			this.timer = null;
		}
		if (this.abortController) {
			this.abortController.abort();
			this.abortController = null;
		}
	}

	_onVisibilityChange() {
		if (!this.isRunning) return;
		if (document.visibilityState === "hidden") {
			if (this.timer) {
				clearTimeout(this.timer);
				this.timer = null;
			}
			this.pausedWhileHidden = true;
		} else if (this.pausedWhileHidden) {
			this.pausedWhileHidden = false;
			this._scheduleNextTick(true);
		}
	}

	_scheduleNextTick(immediate = false) {
		if (!this.isRunning) return;
		if (this.timer) clearTimeout(this.timer);
		const delay = immediate ? 0 : this.interval;
		this.timer = setTimeout(() => this._tick(), delay);
	}

	async _tick() {
		if (!this.isRunning) return;
		try {
			await this._update();
			this.consecutiveErrors = 0;
			this.interval = this.baseInterval;
		} catch (err) {
			this.consecutiveErrors++;
			this.onError(err);
			const steps = this.backoffStepsMs;
			const step = steps[Math.min(this.consecutiveErrors - 1, steps.length - 1)];
			this.interval = Math.max(this.baseInterval, step);
		}
		this._scheduleNextTick();
	}

	_getLocation() {
		return new Promise((resolve) => {
			this.coordsFromDevice = false;
			this.placeName = null;
			if (!navigator.geolocation) {
				this.coords = { ...this.fallbackCoords };
				resolve();
				return;
			}

			const apply = (pos) => {
				this.coordsFromDevice = true;
				this.coords = {
					lat: pos.coords.latitude,
					lon: pos.coords.longitude,
				};
			};
			const useFallback = () => {
				this.coords = { ...this.fallbackCoords };
			};

			const trySlow = () => {
				const to = setTimeout(() => {
					useFallback();
					resolve();
				}, this.geolocationTimeoutMs);

				navigator.geolocation.getCurrentPosition(
					(pos) => {
						clearTimeout(to);
						apply(pos);
						resolve();
					},
					() => {
						clearTimeout(to);
						useFallback();
						resolve();
					},
					{
						enableHighAccuracy: false,
						maximumAge: 120_000,
						timeout: this.geolocationTimeoutMs,
					},
				);
			};

			navigator.geolocation.getCurrentPosition(
				(pos) => {
					apply(pos);
					resolve();
				},
				() => {
					trySlow();
				},
				{
					enableHighAccuracy: false,
					maximumAge: this.geolocationQuickMaxAgeMs,
					timeout: this.geolocationQuickTimeoutMs,
				},
			);
		});
	}

	_mapFog(visibility, cloudCover) {
		if (visibility == null || visibility <= 0) return 0;
		const fog = 1 - Math.min(visibility / 10000, 1);
		return Math.max(0, Math.min(1, fog * (0.5 + cloudCover)));
	}

	_mapThunder(code) {
		const thunderCodes = weatherRules.thunderCodes;
		if (thunderCodes.includes(code)) {
			return { active: true, probability: 0.8 };
		}
		if (code >= 60 && code < 70) {
			return { active: false, probability: 0.2 };
		}
		return { active: false, probability: 0 };
	}

	_computeWind(speed, direction) {
		const rad = (direction * Math.PI) / 180;
		const target = {
			x: Math.sin(rad) * speed,
			z: Math.cos(rad) * speed,
		};
		this.wind.x += (target.x - this.wind.x) * this.smoothing;
		this.wind.z += (target.z - this.wind.z) * this.smoothing;
		return { ...this.wind };
	}

	async _update() {
		const { lat, lon } = this.coords;

		if (this.abortController) this.abortController.abort();
		this.abortController = new AbortController();
		const { signal } = this.abortController;

		const url =
			`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
			`&current_weather=true&hourly=cloudcover,visibility&daily=sunrise,sunset&timezone=auto`;

		const res = await fetch(url, { signal });
		if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);

		let data;
		try {
			data = await res.json();
		} catch {
			throw new Error("Open-Meteo JSON parse error");
		}

		const current = data.current_weather;
		if (!current) throw new Error("Open-Meteo: missing current_weather");

		const now = new Date();
		const hi = hourlyIndexForTime(data.hourly?.time, current.time);
		const cloudCover = (data.hourly?.cloudcover?.[hi] ?? 0) / 100;
		const visibility = data.hourly?.visibility?.[hi];

		let sunrise = now;
		let sunset = now;
		if (data.daily?.sunrise?.[0] && data.daily?.sunset?.[0]) {
			sunrise = new Date(data.daily.sunrise[0]);
			sunset = new Date(data.daily.sunset[0]);
		}

		const isDay = now > sunrise && now < sunset;
		const fogDensity = this._mapFog(visibility, cloudCover);
		const thunder = this._mapThunder(current.weathercode);
		const wind = this._computeWind(current.windspeed, current.winddirection);
		const moonPhase = computeMoonPhase(now);

		const env = {
			time: current.time,
			fetchedAt: now.getTime(),
			isDay,
			sunrise,
			sunset,
			moonPhase,
			latitude: lat,
			longitude: lon,

			weather: {
				code: current.weathercode,
				temperature: current.temperature,
			},

			clouds: {
				density: Math.min(1, cloudCover),
			},

			fog: {
				density: fogDensity,
			},

			thunder: {
				active: thunder.active,
				probability: thunder.probability,
			},

			wind: {
				speed: current.windspeed,
				direction: current.winddirection,
				vector: wind,
			},

			locationKnown: this.coordsFromDevice,
			placeName: this.placeName,
		};

		this.lastEnv = env;
		this.lastSuccessTime = now.getTime();
		this.onUpdate(env);

		if (this.coordsFromDevice && !this.placeName) {
			fetchPlaceName(lat, lon, signal)
				.then((name) => {
					if (signal.aborted || !this.isRunning) return;
					if (typeof name === "string" && name.trim()) this.placeName = name.trim();
					const env2 = { ...this.lastEnv, placeName: this.placeName };
					this.lastEnv = env2;
					this.onUpdate(env2);
				})
				.catch(() => {});
		}
	}

	isStale() {
		if (!this.lastSuccessTime) return true;
		return Date.now() - this.lastSuccessTime > this.staleMs;
	}
}
