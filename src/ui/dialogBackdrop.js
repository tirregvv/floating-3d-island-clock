/**
 * Close a modal `<dialog>` when the user clicks the dimmed area outside the panel.
 * Expects the `<dialog>` to be a full-viewport flex shell with the card in `#…-dialog-inner`.
 *
 * @param {HTMLDialogElement} dialog
 */
export function bindModalBackdropClose(dialog) {
	dialog.addEventListener("click", (e) => {
		if (e.target === dialog) dialog.close();
	});
}
