function getFullscreenElement() {
	return document.fullscreenElement ?? document.webkitFullscreenElement ?? null;
}

async function enterFullscreen(root) {
	if (root.requestFullscreen) return root.requestFullscreen();
	if (root.webkitRequestFullscreen) return root.webkitRequestFullscreen();
	throw new Error("Fullscreen not supported");
}

async function exitFullscreen() {
	if (document.exitFullscreen) return document.exitFullscreen();
	if (document.webkitExitFullscreen) return document.webkitExitFullscreen();
	throw new Error("Fullscreen not supported");
}

/**
 * @param {HTMLElement} root
 */
async function toggleFullscreen(root) {
	try {
		if (getFullscreenElement()) await exitFullscreen();
		else await enterFullscreen(root);
	} catch (e) {
		console.warn("Fullscreen:", e?.message ?? e);
	}
}

function bindFullscreenResizeSync() {
	function onFsChange() {
		queueMicrotask(() => window.dispatchEvent(new Event("resize")));
	}
	document.addEventListener("fullscreenchange", onFsChange);
	document.addEventListener("webkitfullscreenchange", onFsChange);
}

/**
 * Double-click the canvas (or another target) to enter or exit fullscreen on `document.documentElement`.
 *
 * @param {HTMLElement} target — e.g. `renderer.domElement`
 * @param {HTMLElement} [root=document.documentElement]
 */
export function bindFullscreenDoubleClick(target, root = document.documentElement) {
	if (!root.requestFullscreen && !root.webkitRequestFullscreen) return;

	bindFullscreenResizeSync();

	target.addEventListener("dblclick", (e) => {
		e.preventDefault();
		void toggleFullscreen(root);
	});
}
