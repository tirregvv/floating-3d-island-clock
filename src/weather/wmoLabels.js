/** Short user-facing label for WMO weather interpretation code (Open-Meteo). */
export function wmoWeatherStateShort(code) {
	const c = code ?? 0;
	if (c === 0) return "Clear";
	if (c === 1) return "Mostly clear";
	if (c === 2) return "Partly cloudy";
	if (c === 3) return "Overcast";
	if (c === 45 || c === 48) return "Fog";
	if (c >= 51 && c <= 55) return "Drizzle";
	if (c === 56 || c === 57) return "Freezing drizzle";
	if (c === 61 || c === 66 || c === 80) return "Light rain";
	if (c === 63 || c === 81) return "Rain";
	if (c === 65 || c === 82) return "Heavy rain";
	if (c === 67) return "Freezing rain";
	if (c === 71 || c === 85) return "Light snow";
	if (c === 73 || c === 86) return "Snow";
	if (c === 75) return "Heavy snow";
	if (c === 77) return "Snow grains";
	if (c === 95) return "Thunderstorm";
	if (c === 96 || c === 99) return "Thunderstorm · hail";
	return "Weather";
}
