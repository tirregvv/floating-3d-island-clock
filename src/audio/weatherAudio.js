import { getAudioEngine } from "./audioEngine.js";

function isRainCategory(w) {
	return w === "drizzle" || w === "rain" || w === "downpour" || w === "thunderstorm";
}

function isSnowCategory(w) {
	return w === "snow" || w === "snowstorm";
}

/**
 * Drive weather bed layers from the same smoothed state as the visuals.
 * Layer keys must match `weatherTracks` in audioConfig.
 *
 * @param {{ weatherState: { currentWeather: string; smoothedWx: { precipIntensity: number; windStrength: number } } }} ctx
 */
export function driveWeatherAudio(ctx) {
	const engine = getAudioEngine();
	if (!engine?.started) return;
	const wx = ctx.weatherState;
	const s = wx.smoothedWx;
	const cat = wx.currentWeather;
	let rain = 0;
	if (isRainCategory(cat)) rain = s.precipIntensity;
	else if (isSnowCategory(cat)) rain = s.precipIntensity * 0.88;
	const wind = s.windStrength;
	engine.updateWeatherLayers({ rain, wind });
}

/** Call when a new lightning flash is scheduled (overlapping rolls use the engine voice pool). */
export function playThunderRollSfx() {
	getAudioEngine()?.playThunderRoll();
}
