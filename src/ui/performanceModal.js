import * as THREE from "three";
import Stats from "three/examples/jsm/libs/stats.module.js";
import { bindModalBackdropClose } from "./dialogBackdrop.js";

const WARN_RING_MAX = 100;

/** Best-effort filter so the buffer is mostly Three.js / WebGL-related. */
const RELEVANT_WARN_RE =
	/\bTHREE\b|\bWebGL\b|\bwebgl\b|\bGL\b|shader|texture|WebGPU|uniform|program|compile|vertex|fragment|precision|Framebuffer|GPU|draw|context lost|CONTEXT_LOST/i;

const warnRing = [];

/** Bumps when a new warning/error is captured (for DOM refresh only when changed). */
let warnRingGen = 0;

/**
 * @param {unknown[]} args
 * @returns {string}
 */
function formatConsoleArgs(args) {
	return args
		.map((a) => {
			if (a instanceof Error) return a.stack ?? a.message;
			if (typeof a === "string") return a;
			try {
				return JSON.stringify(a);
			} catch {
				return String(a);
			}
		})
		.join(" ");
}

/**
 * @param {string} text
 */
function isRelevantMessage(text) {
	return RELEVANT_WARN_RE.test(text);
}

/**
 * @param {'warn' | 'error'} level
 * @param {unknown[]} args
 */
function pushWarnRing(level, args) {
	const text = formatConsoleArgs(args);
	if (!isRelevantMessage(text)) return;
	warnRing.push({ t: Date.now(), level, text });
	warnRingGen++;
	while (warnRing.length > WARN_RING_MAX) warnRing.shift();
}

const origWarn = console.warn.bind(console);
const origError = console.error.bind(console);

console.warn = (...args) => {
	pushWarnRing("warn", args);
	origWarn(...args);
};

console.error = (...args) => {
	pushWarnRing("error", args);
	origError(...args);
};

/**
 * @param {THREE.Scene} scene
 */
function countSceneObjects(scene) {
	let mesh = 0;
	let skinnedMesh = 0;
	let line = 0;
	let points = 0;
	let light = 0;
	let group = 0;
	scene.traverse((o) => {
		if (o.isGroup) group++;
		if (o.isLight) light++;
		if (o.isPoints) points++;
		if (o.isLine || o.isLineSegments || o.isLineLoop) line++;
		if (o.isSkinnedMesh) {
			skinnedMesh++;
		} else if (o.isMesh) {
			mesh++;
		}
	});
	return { mesh, skinnedMesh, line, points, light, group };
}

/**
 * @param {import("three").WebGLRenderer} renderer
 * @returns {Record<string, unknown>}
 */
function snapshotRenderer(renderer) {
	const caps = renderer.capabilities;
	const info = renderer.info;
	const drawingBufferSize = renderer.getDrawingBufferSize(new THREE.Vector2());

	const toneMappingNames = {
		[THREE.NoToneMapping]: "NoToneMapping",
		[THREE.LinearToneMapping]: "LinearToneMapping",
		[THREE.ReinhardToneMapping]: "ReinhardToneMapping",
		[THREE.CineonToneMapping]: "CineonToneMapping",
		[THREE.ACESFilmicToneMapping]: "ACESFilmicToneMapping",
		[THREE.AgXToneMapping]: "AgXToneMapping",
		[THREE.NeutralToneMapping]: "NeutralToneMapping",
	};

	const shadowTypeNames = {
		[THREE.BasicShadowMap]: "BasicShadowMap",
		[THREE.PCFShadowMap]: "PCFShadowMap",
		[THREE.PCFSoftShadowMap]: "PCFSoftShadowMap",
		[THREE.VSMShadowMap]: "VSMShadowMap",
	};

	const colorSpaceNames = {
		[THREE.NoColorSpace]: "NoColorSpace",
		[THREE.SRGBColorSpace]: "SRGBColorSpace",
		[THREE.LinearSRGBColorSpace]: "LinearSRGBColorSpace",
	};

	const out = {
		drawingBufferWidth: drawingBufferSize.x,
		drawingBufferHeight: drawingBufferSize.y,
		pixelRatio: renderer.getPixelRatio(),
		antialias: renderer.getContextAttributes()?.antialias ?? null,
		toneMapping:
			toneMappingNames[renderer.toneMapping] ?? `toneMapping(${renderer.toneMapping})`,
		toneMappingExposure: renderer.toneMappingExposure,
		outputColorSpace:
			colorSpaceNames[renderer.outputColorSpace] ??
			`outputColorSpace(${renderer.outputColorSpace})`,
		shadowMapEnabled: renderer.shadowMap.enabled,
		shadowMapType:
			shadowTypeNames[renderer.shadowMap.type] ?? `shadowMap.type(${renderer.shadowMap.type})`,
		isWebGL2: caps.isWebGL2,
		maxAnisotropy: caps.maxAnisotropy,
	};

	/** @type {Record<string, unknown>} */
	const infoOut = {
		render: { ...info.render },
		memory: { ...info.memory },
	};
	const programs = info.programs;
	if (programs != null && typeof programs === "object" && "length" in programs) {
		infoOut.programsLength = programs.length;
	}
	return { renderer: out, info: infoOut };
}

/**
 * @param {import("three").WebGLRenderer} renderer
 */
function webglContextState(renderer) {
	const canvas = renderer.domElement;
	const gl = renderer.getContext();
	let loseExt = null;
	try {
		loseExt = gl.getExtension("WEBGL_lose_context");
	} catch {
		/* ignore */
	}
	return {
		drawingBufferWidth: gl.drawingBufferWidth,
		drawingBufferHeight: gl.drawingBufferHeight,
		loseContextExtensionAvailable: Boolean(loseExt),
		canvasInDom: typeof canvas?.isConnected === "boolean" ? canvas.isConnected : null,
	};
}

function formatWarningsBlock() {
	if (warnRing.length === 0) return "(none captured yet)\n";
	const lines = warnRing.map(({ t, level, text }) => {
		const time = new Date(t).toISOString().slice(11, 23);
		return `[${time}] ${level}: ${text}`;
	});
	return `${lines.join("\n")}\n`;
}

/**
 * @param {object} options
 * @param {HTMLDialogElement} options.dialog
 * @param {HTMLButtonElement} options.openButton
 * @param {HTMLButtonElement} options.closeButton
 * @param {HTMLElement} options.statsMount
 * @param {HTMLPreElement} options.detailsEl
 * @param {HTMLPreElement} options.warningsEl
 * @param {() => Record<string, unknown>} options.getContext
 * @returns {(renderer: import("three").WebGLRenderer, scene: import("three").Scene) => void}
 */
export function bindPerformanceModal({
	dialog,
	openButton,
	closeButton,
	statsMount,
	detailsEl,
	warningsEl,
	getContext,
}) {
	const stats = new Stats();

	/** Non-null only while the dialog is open: no stats/JSON/scene work when closed (console ring still fills). */
	let livePerfFrame = null;

	/** Throttle expensive JSON + scene traverse while the modal is open (Stats stays every frame). */
	let heavyFrameCounter = 0;
	const HEAVY_EVERY_N_FRAMES = 12;
	let lastWarningsGenRendered = -1;

	function setOpenAria(on) {
		openButton.setAttribute("aria-expanded", String(on));
	}

	function detachStats() {
		if (stats.dom.parentNode === statsMount) statsMount.removeChild(stats.dom);
	}

	function onFullscreenMaybeChange() {
		const el = document.fullscreenElement ?? document.webkitFullscreenElement;
		if (el != null && dialog.open) dialog.close();
	}

	function livePerfUpdate(rendererRef, sceneRef) {
		stats.update();

		heavyFrameCounter++;
		const doHeavy =
			heavyFrameCounter === 1 || heavyFrameCounter % HEAVY_EVERY_N_FRAMES === 0;

		if (doHeavy) {
			const ctx = { threeRevision: THREE.REVISION, ...getContext() };
			const perfMem =
				typeof performance !== "undefined" && "memory" in performance && performance.memory
					? {
							usedJSHeapSize: performance.memory.usedJSHeapSize,
							totalJSHeapSize: performance.memory.totalJSHeapSize,
							jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
						}
					: null;

			const snap = snapshotRenderer(rendererRef);
			const glState = webglContextState(rendererRef);
			const sceneCounts = countSceneObjects(sceneRef);

			const payload = {
				...snap,
				webgl: glState,
				sceneCounts,
				runtimeContext: ctx,
				performanceMemory: perfMem,
			};

			detailsEl.textContent = `${JSON.stringify(payload, null, 2)}\n`;
		}

		if (warnRingGen !== lastWarningsGenRendered) {
			warningsEl.textContent = formatWarningsBlock();
			lastWarningsGenRendered = warnRingGen;
		}
	}

	openButton.addEventListener("click", () => {
		if (dialog.open) return;
		statsMount.appendChild(stats.dom);
		heavyFrameCounter = 0;
		lastWarningsGenRendered = -1;
		livePerfFrame = livePerfUpdate;
		dialog.showModal();
		setOpenAria(true);
		warningsEl.textContent = formatWarningsBlock();
		lastWarningsGenRendered = warnRingGen;
	});

	closeButton.addEventListener("click", () => {
		dialog.close();
	});

	bindModalBackdropClose(dialog);

	dialog.addEventListener("close", () => {
		livePerfFrame = null;
		setOpenAria(false);
		detachStats();
	});

	document.addEventListener("fullscreenchange", onFullscreenMaybeChange);
	document.addEventListener("webkitfullscreenchange", onFullscreenMaybeChange);

	function afterRender(rendererRef, sceneRef) {
		livePerfFrame?.(rendererRef, sceneRef);
	}

	return afterRender;
}
