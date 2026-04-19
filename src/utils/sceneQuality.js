/**
 * Scene complexity scaling for weak GPUs (smart TVs, STBs). Fill rate matters more than raw GL limits.
 */
import * as config from "../config.js";

/**
 * @param {boolean} embeddedDisplay — true when isEmbeddedDisplayClient() matches (smart TV / STB).
 * @returns {typeof config.counts}
 */
export function getEffectiveSceneCounts(embeddedDisplay) {
	const c = config.counts;
	if (!embeddedDisplay) return c;
	const s = config.embeddedDisplayScale;
	return {
		...c,
		trees: Math.max(8, Math.round(c.trees * s.trees)),
		rocks: Math.max(10, Math.round(c.rocks * s.rocks)),
		flowers: Math.max(16, Math.round(c.flowers * s.flowers)),
		baseClouds: Math.max(4, Math.round(c.baseClouds * s.baseClouds)),
		stormClouds: Math.max(6, Math.round(c.stormClouds * s.stormClouds)),
		rainDrops: Math.max(80, Math.round(c.rainDrops * s.rainDrops)),
		puddles: Math.max(18, Math.round(c.puddles * s.puddles)),
		leafParticles: Math.max(40, Math.round(c.leafParticles * s.leafParticles)),
		snowFlakes: Math.max(120, Math.round(c.snowFlakes * s.snowFlakes)),
		stars: Math.max(200, Math.round(c.stars * s.stars)),
	};
}
