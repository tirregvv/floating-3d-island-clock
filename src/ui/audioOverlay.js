import { alwaysShowStartGate, audioUnlockStorageKey } from "../audio/audioConfig.js";

/**
 * @param {object} p
 * @param {HTMLElement} p.overlay
 * @param {HTMLButtonElement} p.button
 * @param {{ resumeAndStart: () => Promise<boolean> }} p.engine
 */
export function bindAudioStartGate({ overlay, button, engine }) {
	const hide = () => {
		overlay.setAttribute("hidden", "");
		overlay.classList.add("audio-start-overlay--hidden");
	};

	const show = () => {
		overlay.removeAttribute("hidden");
		overlay.classList.remove("audio-start-overlay--hidden");
	};

	async function tryAutoStart() {
		if (alwaysShowStartGate) {
			show();
			return;
		}
		if (sessionStorage.getItem(audioUnlockStorageKey) !== "1") {
			show();
			return;
		}
		const ok = await engine.resumeAndStart();
		if (ok) hide();
		else show();
	}

	button.addEventListener("click", async () => {
		const ok = await engine.resumeAndStart();
		if (ok) {
			sessionStorage.setItem(audioUnlockStorageKey, "1");
			hide();
		}
	});

	tryAutoStart();
}
