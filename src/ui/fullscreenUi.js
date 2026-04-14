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
		button.textContent = on ? "\u2715" : "\u29F9";
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
