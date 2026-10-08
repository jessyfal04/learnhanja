export function bindHoldButton(button, requiresHold, activate, {duration = 1200, blurTarget = globalThis} = {}) {
	let active = null;
	function cancel() {
		if (!active) return;
		clearTimeout(active.timer);
		active = null;
		button.classList.remove("is-holding");
	}
	function start(source, pointerId = null) {
		if (active || !requiresHold()) return;
		const timer = setTimeout(() => {
			if (active?.timer !== timer) return;
			active = null;
			button.classList.remove("is-holding");
			activate();
		}, duration);
		active = {source, pointerId, timer};
		button.classList.add("is-holding");
	}
	button.addEventListener("click", () => { if (!requiresHold()) activate(); });
	button.addEventListener("pointerdown", (event) => {
		if (!requiresHold() || event.button !== 0) return;
		start("pointer", event.pointerId);
		button.setPointerCapture?.(event.pointerId);
	});
	button.addEventListener("pointermove", (event) => {
		if (active?.source !== "pointer" || active.pointerId !== event.pointerId) return;
		const bounds = button.getBoundingClientRect();
		if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) cancel();
	});
	button.addEventListener("pointerup", (event) => { if (active?.source === "pointer" && active.pointerId === event.pointerId) cancel(); });
	button.addEventListener("pointercancel", cancel);
	button.addEventListener("keydown", (event) => {
		if (!requiresHold() || ![" ", "Enter"].includes(event.key)) return;
		event.preventDefault();
		if (!event.repeat) start("keyboard");
	});
	button.addEventListener("keyup", (event) => {
		if (!requiresHold() || ![" ", "Enter"].includes(event.key)) return;
		event.preventDefault();
		if (active?.source === "keyboard") cancel();
	});
	button.addEventListener("blur", cancel);
	button.addEventListener("contextmenu", (event) => { if (requiresHold()) event.preventDefault(); });
	blurTarget.addEventListener?.("blur", cancel);
	return cancel;
}
