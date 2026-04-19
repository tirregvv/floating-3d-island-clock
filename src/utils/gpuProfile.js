/**
 * Renderer quality tier from WebGL capability queries and coarse hardware hints.
 * Desktop/TV paths use GPU signals; phones/tablets additionally force shadows off — reported GL
 * limits are often fine while shadow passes still black-screen or drop the scene on mobile GPUs
 * (see three.js discussions around shadowMap.enabled on iOS/Android).
 */
import * as config from "../config.js";

const SOFTWARE_RENDERER_RE =
	/swiftshader|llvmpipe|microsoft basic render driver|software rasterizer|virgl|softpipe|mesa offscreen|google swiftshader/i;

/** TV / STB / console browsers — supplement when GPU limits are borderline; same list as isEmbeddedDisplayClient(). */
const EMBEDDED_DISPLAY_UA_RE =
	/SmartTV|Web0S|webOS|Tizen\s*\(|CrKey|AFTB|AFTT|BRAVIA|AppleTV|PlayStation|Xbox|Nintendo|HbbTV|Android TV|SHIELD Android TV|NVIDIA SHIELD/i;

/**
 * @param {WebGLRenderingContext | WebGL2RenderingContext} gl
 * @returns {string | null}
 */
function readUnmaskedRenderer(gl) {
	try {
		const ext = gl.getExtension("WEBGL_debug_renderer_info");
		if (!ext) return null;
		return gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) ?? null;
	} catch {
		return null;
	}
}

/**
 * @param {import("three").WebGLRenderer} renderer
 * @param {{ userAgent?: string; thresholds?: object }} [options]
 * @returns {{
 *   allowShadowMaps: boolean,
 *   useReducedShadowResolution: boolean,
 *   boostedFillLighting: boolean,
 *   reasons: string[],
 *   debug: Record<string, unknown>,
 * }}
 */
export function evaluateGpuProfile(renderer, options = {}) {
	const ua = options.userAgent ?? (typeof navigator !== "undefined" ? navigator.userAgent : "");
	const thresholds = options.thresholds ?? config.gpuProfileThresholds;
	const gl = renderer.getContext();
	const caps = renderer.capabilities;

	const reasons = [];
	/** @type {Record<string, unknown>} */
	const debug = {};

	const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
	const maxRb = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE);
	const maxCube = gl.getParameter(gl.MAX_CUBE_MAP_TEXTURE_SIZE);

	debug.maxTextureSize = maxTex;
	debug.maxRenderbufferSize = maxRb;
	debug.maxCubeMapTextureSize = maxCube;
	debug.isWebGL2 = caps.isWebGL2;

	let allowShadowMaps = true;
	let useReducedShadowResolution = false;

	const unmasked = readUnmaskedRenderer(gl);
	debug.unmaskedRenderer = unmasked;
	if (unmasked && SOFTWARE_RENDERER_RE.test(unmasked)) {
		allowShadowMaps = false;
		reasons.push("software/WebGL stack (UNMASKED_RENDERER)");
	}

	if (maxTex < thresholds.minTextureSizeForShadows) {
		allowShadowMaps = false;
		reasons.push(`MAX_TEXTURE_SIZE ${maxTex} < ${thresholds.minTextureSizeForShadows}`);
	}

	if (maxRb < thresholds.minRenderbufferSizeForShadows) {
		allowShadowMaps = false;
		reasons.push(`MAX_RENDERBUFFER_SIZE ${maxRb} < ${thresholds.minRenderbufferSizeForShadows}`);
	}

	if (maxCube < thresholds.minCubeMapTextureSizeForShadows) {
		allowShadowMaps = false;
		reasons.push(`MAX_CUBE_MAP_TEXTURE_SIZE ${maxCube} < ${thresholds.minCubeMapTextureSizeForShadows}`);
	}

	if (!caps.isWebGL2 && maxTex < thresholds.webgl1MinTextureSizeForShadows) {
		allowShadowMaps = false;
		reasons.push(`WebGL1 MAX_TEXTURE_SIZE ${maxTex} < ${thresholds.webgl1MinTextureSizeForShadows}`);
	}

	/** @type {number | undefined} */
	let deviceMemoryGb;
	if (typeof navigator !== "undefined" && typeof navigator.deviceMemory === "number") {
		deviceMemoryGb = navigator.deviceMemory;
		debug.deviceMemoryGb = deviceMemoryGb;
		if (deviceMemoryGb <= thresholds.disableShadowsDeviceMemoryGb) {
			allowShadowMaps = false;
			reasons.push(`deviceMemory ${deviceMemoryGb}GiB ≤ ${thresholds.disableShadowsDeviceMemoryGb}GiB`);
		} else if (deviceMemoryGb <= thresholds.reduceShadowsDeviceMemoryGb) {
			useReducedShadowResolution = true;
			reasons.push(`deviceMemory ${deviceMemoryGb}GiB → reduced shadow maps`);
		}
	}

	/** @type {number | undefined} */
	let cores;
	if (typeof navigator !== "undefined" && typeof navigator.hardwareConcurrency === "number") {
		cores = navigator.hardwareConcurrency;
		debug.hardwareConcurrency = cores;
		if (allowShadowMaps && cores <= thresholds.reduceShadowsHardwareConcurrency) {
			useReducedShadowResolution = true;
			reasons.push(`hardwareConcurrency ${cores} → reduced shadow maps`);
		}
	}

	/* Mid-tier GPUs: keep shadows but shrink atlases (less bandwidth, fewer driver issues). */
	if (allowShadowMaps && maxTex < thresholds.fullTierMinTextureSize) {
		useReducedShadowResolution = true;
		reasons.push(`MAX_TEXTURE_SIZE ${maxTex} < ${thresholds.fullTierMinTextureSize} → reduced shadow maps`);
	}

	const embeddedTvClass = EMBEDDED_DISPLAY_UA_RE.test(ua);
	debug.embeddedTvClass = embeddedTvClass;
	if (embeddedTvClass) {
		if (maxTex < thresholds.embeddedTvDisableShadowsBelowTextureSize) {
			allowShadowMaps = false;
			reasons.push(
				`embedded display UA + MAX_TEXTURE_SIZE ${maxTex} < ${thresholds.embeddedTvDisableShadowsBelowTextureSize} (shadows off)`,
			);
		} else if (allowShadowMaps) {
			useReducedShadowResolution = true;
			reasons.push("embedded display UA → compact shadow maps (shadows stay on)");
		}
	}

	if (!allowShadowMaps) {
		useReducedShadowResolution = true;
	}

	/** Brighter ambient/hemisphere when fill is needed — not tied to reduced atlas sizes alone (desktop IGPs keep desktop lighting). */
	const boostedFillLighting =
		!allowShadowMaps ||
		(deviceMemoryGb !== undefined && deviceMemoryGb <= thresholds.boostFillLightingDeviceMemoryGb);

	if (reasons.length === 0) {
		reasons.push("full GPU shadow path");
	}

	return {
		allowShadowMaps,
		useReducedShadowResolution,
		boostedFillLighting,
		reasons,
		debug,
	};
}

/**
 * Phones/tablets (including iPadOS desktop UA): never use dynamic shadow maps — GPU limits alone
 * are unreliable here. TVs/set-tops use {@link evaluateGpuProfile} without matching this.
 *
 * @param {Navigator & { userAgentData?: { mobile?: boolean } }} [nav]
 */
export function isConstrainedMobileClient(nav = typeof navigator !== "undefined" ? navigator : {}) {
	const ua = typeof nav.userAgent === "string" ? nav.userAgent : "";
	if (config.mobileUserAgentRe.test(ua)) return true;
	try {
		const uaData = nav.userAgentData;
		if (uaData && typeof uaData.mobile === "boolean" && uaData.mobile) return true;
	} catch {
		/* Client Hints may throw outside secure contexts */
	}
	/** iPadOS 13+ Safari reports desktop platform with touch */
	if (nav.platform === "MacIntel" && typeof nav.maxTouchPoints === "number" && nav.maxTouchPoints > 1) return true;
	return false;
}

/**
 * @param {ReturnType<typeof evaluateGpuProfile>} gpu
 * @param {boolean} constrainedMobile — {@link isConstrainedMobileClient}; shadows stay off regardless of GPU tier.
 */
export function buildRenderStyle(gpu, constrainedMobile) {
	const shadowMapsEnabled = gpu.allowShadowMaps && !constrainedMobile;
	return {
		shadowMapsEnabled,
		compactShadowMaps: !shadowMapsEnabled || gpu.useReducedShadowResolution,
		boostedFillLighting: gpu.boostedFillLighting || constrainedMobile,
	};
}

/**
 * Living-room TV / STB / console browsers — use for resolution & scene workload cuts (not normal phones).
 * @param {string} [ua]
 */
export function isEmbeddedDisplayClient(ua = typeof navigator !== "undefined" ? navigator.userAgent : "") {
	return EMBEDDED_DISPLAY_UA_RE.test(ua);
}
