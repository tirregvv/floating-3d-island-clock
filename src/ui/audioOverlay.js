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

	function isUnlockedThisSession() {
		try {
			return sessionStorage.getItem(audioUnlockStorageKey) === "1";
		} catch {
			return false;
		}
	}

	function markUnlockedThisSession() {
		try {
			sessionStorage.setItem(audioUnlockStorageKey, "1");
		} catch {
			/* ignore unavailable storage (some WebViews / privacy modes) */
		}
	}

	async function tryAutoStart() {
		if (alwaysShowStartGate) {
			show();
			return;
		}
		if (!isUnlockedThisSession()) {
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
			markUnlockedThisSession();
			hide();
		}
	});

	tryAutoStart();
}
