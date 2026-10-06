import { formatFrequencyRank, frequencyMean, frequencyMedian } from "./frequency.js";

let frequencyPopover = null;
let frequencyPopoverCloseTimer = null;

export function frequencyCell(entry) {
	const element = document.createElement("td");
	element.className = "frequency-info-cell";
	const value = document.createElement("span");
	value.className = "frequency-value";
	value.textContent = formatFrequencyRank(frequencyMean(entry));
	const button = document.createElement("button");
	button.type = "button";
	button.className = "button is-small is-light idiom-info-button";
	button.textContent = "ⓘ";
	button.title = `${entry.hangul} 빈도 순위 상세`;
	button.setAttribute("aria-label", `${entry.hangul} 빈도 순위 상세`);
	button.setAttribute("aria-haspopup", "dialog");
	button.setAttribute("aria-expanded", "false");
	button.addEventListener("pointerenter", () => showFrequencyPopover(button, entry));
	button.addEventListener("pointerleave", scheduleFrequencyPopoverClose);
	button.addEventListener("focus", () => showFrequencyPopover(button, entry));
	button.addEventListener("blur", scheduleFrequencyPopoverClose);
	button.addEventListener("click", (event) => {
		event.stopPropagation();
		showFrequencyPopover(button, entry);
	});
	element.append(value, button);
	return element;
}

function showFrequencyPopover(button, entry) {
	cancelFrequencyPopoverClose();
	if (frequencyPopover?.button === button) return;
	closeFrequencyPopover();
	const popover = document.createElement("div");
	popover.className = "notification is-light idiom-source-popover frequency-popover p-3";
	popover.setAttribute("role", "dialog");
	popover.setAttribute("aria-label", `${entry.hangul} 빈도 순위 상세`);
	popover.addEventListener("pointerenter", cancelFrequencyPopoverClose);
	popover.addEventListener("pointerleave", scheduleFrequencyPopoverClose);
	const content = document.createElement("div");
	content.className = "content is-small mb-0";
	content.append(
		frequencyLine("평균", frequencyMean(entry)),
		frequencyLine("중앙값", frequencyMedian(entry)),
		frequencyLine("Pokémon", entry.pokemonRank),
		frequencyLine("국립국어원", entry.niklRank),
		frequencyLine("HermitDave 2018", entry.hermitDaveRank),
	);
	popover.append(content);
	document.body.append(popover);
	button.setAttribute("aria-expanded", "true");
	frequencyPopover = {button, popover};

	const buttonRect = button.getBoundingClientRect();
	const popoverRect = popover.getBoundingClientRect();
	const gap = 6;
	const left = Math.min(Math.max(gap, buttonRect.right - popoverRect.width), window.innerWidth - popoverRect.width - gap);
	const below = buttonRect.bottom + gap;
	const top = below + popoverRect.height <= window.innerHeight - gap ? below : Math.max(gap, buttonRect.top - popoverRect.height - gap);
	popover.style.left = `${left}px`;
	popover.style.top = `${top}px`;
}

function frequencyLine(label, rank) {
	const line = document.createElement("p");
	line.className = "mb-1";
	line.textContent = `${label}: ${Number(rank) > 0 ? formatFrequencyRank(Number(rank)) : "없음"}`;
	return line;
}

export function closeFrequencyPopover() {
	cancelFrequencyPopoverClose();
	if (!frequencyPopover) return;
	frequencyPopover.button.setAttribute("aria-expanded", "false");
	frequencyPopover.popover.remove();
	frequencyPopover = null;
}

function scheduleFrequencyPopoverClose() {
	cancelFrequencyPopoverClose();
	frequencyPopoverCloseTimer = window.setTimeout(closeFrequencyPopover, 150);
}

function cancelFrequencyPopoverClose() {
	if (frequencyPopoverCloseTimer === null) return;
	window.clearTimeout(frequencyPopoverCloseTimer);
	frequencyPopoverCloseTimer = null;
}

document.addEventListener?.("click", (event) => {
	if (frequencyPopover && !frequencyPopover.popover.contains(event.target)) closeFrequencyPopover();
});

document.addEventListener?.("keydown", (event) => {
	if (event.key === "Escape") closeFrequencyPopover();
});

window.addEventListener?.("scroll", closeFrequencyPopover, true);
