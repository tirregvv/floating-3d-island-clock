const SVG_BASE =
	'xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';

/** Expand into fullscreen (corner brackets + outward arrows). */
const ICON_ENTER_FULLSCREEN = `<svg ${SVG_BASE}><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>`;

/** Contract / exit fullscreen (inward arrows). */
const ICON_EXIT_FULLSCREEN = `<svg ${SVG_BASE}><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg>`;

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

export function bindFullscreenToggle(button) {
	const root = document.documentElement;
	if (!root.requestFullscreen && !root.webkitRequestFullscreen) {
		button.hidden = true;
		return;
	}

	function sync() {
		const on = getFullscreenElement() != null;
		button.setAttribute("aria-pressed", String(on));
		button.title = on ? "Exit fullscreen" : "Fullscreen";
		button.setAttribute("aria-label", on ? "Exit fullscreen" : "Enter fullscreen");
		button.innerHTML = on ? ICON_EXIT_FULLSCREEN : ICON_ENTER_FULLSCREEN;
		queueMicrotask(() => window.dispatchEvent(new Event("resize")));
	}

	button.addEventListener("click", async () => {
		try {
			if (getFullscreenElement()) await exitFullscreen();
			else await enterFullscreen(root);
		} catch (e) {
			console.warn("Fullscreen:", e?.message ?? e);
		}
	});

	document.addEventListener("fullscreenchange", sync);
	document.addEventListener("webkitfullscreenchange", sync);
	sync();
}
