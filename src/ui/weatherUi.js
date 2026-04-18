import { mapToSceneWeather } from "../../weatherEngine.js";
import * as config from "../config.js";
import { wmoWeatherStateShort } from "../weather/wmoLabels.js";

export function setWeatherLabel(weatherLabel, w, live, liveWeatherActive) {
	const mode = live !== false && liveWeatherActive ? "Live" : "Demo";
	const icons = config.weather.icons;
	weatherLabel.textContent = `${icons[w]} ${w.charAt(0).toUpperCase() + w.slice(1)} · ${mode}`;
}

function formatPresetName(category) {
	return category.charAt(0).toUpperCase() + category.slice(1);
}

/** @param {object | null | undefined} env API snapshot from WeatherEngine */
export function setLocationWeatherOverlay(env, weatherState) {
	const right = document.getElementById("time-overlay-right");
	const cityEl = document.getElementById("location-display");
	const wxEl = document.getElementById("location-weather-display");
	if (!right || !cityEl || !wxEl) return;

	const live = weatherState?.liveWeatherActive !== false;

	if (live && weatherState?.awaitingLiveLocation) {
		right.hidden = false;
		cityEl.textContent = "Getting location…";
		wxEl.textContent = "Live weather";
		return;
	}

	const locationKnown = Boolean(env?.locationKnown);

	if (live && !locationKnown) {
		right.hidden = true;
		return;
	}

	right.hidden = false;
	cityEl.textContent = locationKnown ? env.placeName || "Local" : "Demo";

	const icons = config.weather.icons;
	if (live && locationKnown) {
		const code = env.weather?.code ?? 0;
		const state = wmoWeatherStateShort(code);
		const temp = env.weather?.temperature;
		const tempStr = temp != null && Number.isFinite(temp) ? `${Math.round(temp)}°` : "—";
		const category = mapToSceneWeather(env).category;
		const icon = icons[category] ?? icons.clear;
		// wxEl.textContent = `${icon} ${state} · ${tempStr} · Live`;
		wxEl.textContent = `${icon} ${state} · ${tempStr}`;
	} else {
		const w = weatherState?.currentWeather ?? "clear";
		const icon = icons[w] ?? icons.clear;
		const intNames = ["light", "medium", "strong"];
		const i = Math.max(0, Math.min(2, weatherState?.demoIntensity ?? 1));
		const intLabel = intNames[i];
		// wxEl.textContent = `${icon} ${formatPresetName(w)} · ${intLabel} · Demo`;
		wxEl.textContent = `${icon} ${formatPresetName(w)} · ${intLabel}`;
	}
}
