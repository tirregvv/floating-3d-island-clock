/**
 * Keeps the screen awake using the Screen Wake Lock API where available.
 * - Chromium / Android / many smart TVs: works after a user gesture (tap, click, key).
 * - Safari iOS 16.4+: partial support; may still dim per OS settings.
 * - Falls back silently when unsupported or denied.
 */

/** @type {WakeLockSentinel | null} */
let sentinel = null;

async function acquire() {
	if (typeof navigator === "undefined" || !navigator.wakeLock?.request) return;
	try {
		if (sentinel && !sentinel.released) return;
		sentinel = await navigator.wakeLock.request("screen");
		sentinel.addEventListener("release", () => {
			sentinel = null;
		});
	} catch {
		/* NotAllowedError (no user gesture), NotSupportedError, etc. */
	}
}

function onUserActivation() {
	void acquire();
	document.removeEventListener("pointerdown", onUserActivation);
	document.removeEventListener("keydown", onUserActivation);
}

/** Call once at startup. Requests wake lock after first touch/click/key; re-acquires when the tab/app regains visibility. */
export function setupScreenWakeLock() {
	if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return;

	document.addEventListener("pointerdown", onUserActivation, { passive: true });
	document.addEventListener("keydown", onUserActivation, { passive: true });

	document.addEventListener("visibilitychange", () => {
		if (document.visibilityState === "visible") void acquire();
	});
}
