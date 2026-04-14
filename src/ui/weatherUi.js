import { mapToSceneWeather } from "../../weatherEngine.js";
import * as config from "../config.js";
import { wmoWeatherStateShort } from "../weather/wmoLabels.js";

export function setWeatherLabel(weatherLabel, w, live, liveWeatherActive) {
	const mode = live !== false && liveWeatherActive ? "Live" : "Demo";
	const icons = config.weather.icons;
	weatherLabel.textContent = `${icons[w]} ${w.charAt(0).toUpperCase() + w.slice(1)} · ${mode}`;
}

export function setLocationWeatherOverlay(env) {
	const right = document.getElementById("time-overlay-right");
	const cityEl = document.getElementById("location-display");
	const wxEl = document.getElementById("location-weather-display");
	if (!right || !cityEl || !wxEl) return;

	if (!env?.locationKnown) {
		right.hidden = true;
		return;
	}

	right.hidden = false;
	cityEl.textContent = env.placeName || "Local";

	const code = env.weather?.code ?? 0;
	const state = wmoWeatherStateShort(code);
	const temp = env.weather?.temperature;
	const tempStr = temp != null && Number.isFinite(temp) ? `${Math.round(temp)}°` : "—";
	const category = mapToSceneWeather(env).category;
	const icon = config.weather.icons[category] ?? config.weather.icons.clear;
	wxEl.textContent = `${icon} ${state} · ${tempStr}`;
}
