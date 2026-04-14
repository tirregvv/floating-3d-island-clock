/**
 * Open-Meteo client for live weather. Forecast data: https://open-meteo.com/
 */

const STALE_MS = 45 * 60 * 1000;
const BACKOFF_STEPS_MS = [60_000, 120_000, 300_000, 900_000];

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

	const snowCodes = [71, 73, 75, 77, 85, 86];
	const rainHeavy = [65, 82, 92];
	const rainLight = [51, 53, 55, 56, 57, 61, 63, 66, 67, 80, 81];
	const thunderCodes = [95, 96, 99];

	if (thunderCodes.includes(code) || thunder.active) {
		category = "thunderstorm";
		precipIntensity = 0.75 + thunder.probability * 0.25;
	} else if (snowCodes.includes(code) || (temp < 1.5 && (rainLight.includes(code) || rainHeavy.includes(code)))) {
		category = "snowstorm";
		precipIntensity = snowCodes.includes(code) ? 0.85 : 0.45;
	} else if (rainHeavy.includes(code)) {
		category = "rain";
		precipIntensity = 0.9;
	} else if (rainLight.includes(code)) {
		category = "rain";
		precipIntensity = code >= 61 ? 0.55 : 0.35;
	} else if (code >= 1 && code <= 3) {
		category = "cloudy";
		precipIntensity = 0;
	} else if (windSpeed > 35) {
		category = "windy";
		precipIntensity = 0;
	} else {
		category = "clear";
	}

	const windStrength = Math.min(1, windSpeed / 40);
	const cloudDensity = Math.min(1, cloudD + (category === "cloudy" ? 0.25 : 0) + (category === "thunderstorm" ? 0.15 : 0));
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
		interval = 60_000,
		onUpdate = () => {},
		onError = () => {},
		smoothing = 0.1,
		fallbackCoords = { lat: 52.52, lon: 13.405 },
		geolocationTimeoutMs = 12_000,
	} = {}) {
		this.baseInterval = interval;
		this.interval = interval;
		this.onUpdate = onUpdate;
		this.onError = onError;
		this.smoothing = smoothing;
		this.fallbackCoords = fallbackCoords;
		this.geolocationTimeoutMs = geolocationTimeoutMs;

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
			const step = BACKOFF_STEPS_MS[Math.min(this.consecutiveErrors - 1, BACKOFF_STEPS_MS.length - 1)];
			this.interval = Math.max(this.baseInterval, step);
		}
		this._scheduleNextTick();
	}

	_getLocation() {
		return new Promise((resolve) => {
			if (!navigator.geolocation) {
				this.coords = { ...this.fallbackCoords };
				resolve();
				return;
			}
			const to = setTimeout(() => {
				this.coords = { ...this.fallbackCoords };
				resolve();
			}, this.geolocationTimeoutMs);

			navigator.geolocation.getCurrentPosition(
				(pos) => {
					clearTimeout(to);
					this.coords = {
						lat: pos.coords.latitude,
						lon: pos.coords.longitude,
					};
					resolve();
				},
				() => {
					clearTimeout(to);
					this.coords = { ...this.fallbackCoords };
					resolve();
				},
				{ enableHighAccuracy: false, maximumAge: 300_000, timeout: this.geolocationTimeoutMs },
			);
		});
	}

	_mapFog(visibility, cloudCover) {
		if (visibility == null || visibility <= 0) return 0;
		const fog = 1 - Math.min(visibility / 10000, 1);
		return Math.max(0, Math.min(1, fog * (0.5 + cloudCover)));
	}

	_mapThunder(code) {
		const thunderCodes = [95, 96, 99];
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
		};

		this.lastEnv = env;
		this.lastSuccessTime = now.getTime();
		this.onUpdate(env);
	}

	isStale() {
		if (!this.lastSuccessTime) return true;
		return Date.now() - this.lastSuccessTime > STALE_MS;
	}
}
