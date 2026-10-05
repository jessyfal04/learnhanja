import { buildLevelIndex, filterAndSortIdioms, idiomCharacters, idiomLevel, idiomStatusInfo } from "./idiom-filter.js?v=1";
import { insightLink } from "./insights.js?v=11";
import { state } from "./state.js";
import { loadStaticJSON } from "./static-data.js";
import { studyStatusKey, studyStatusPresentation } from "./study-status.js?v=2";
import { koreanError, showMessage } from "./ui.js";

let levelIndex = null;
let sourcePopover = null;
let sourcePopoverCloseTimer = null;

export function initializeIdiomLevels() {
	levelIndex = buildLevelIndex(state.catalog);
	const filter = document.getElementById("idiomLevelFilter");
	filter.replaceChildren(option("all", "전체 급수"), ...levelIndex.levels.map((level) => option(level, level)), option("unknown", "급수 미상"));
	renderIdioms();
}

export async function loadIdioms() {
	try {
		state.idioms = await loadStaticJSON("/data/idioms.json");
		const filter = document.getElementById("idiomSourceFilter");
		filter.replaceChildren(option("all", `전체 통합 (${state.idioms.total})`), ...state.idioms.sources.map((source) => option(source.id, `${source.shortName} (${source.total})`)));
		filter.value = "all";
		renderIdioms();
	} catch (error) {
		showMessage("danger", koreanError(error, "사자성어 목록을 불러올 수 없습니다"));
	}
}

export function renderIdioms() {
	if (!state.idioms) return;
	closeSourcePopover();
	const sourceID = document.getElementById("idiomSourceFilter").value;
	const level = document.getElementById("idiomLevelFilter").value;
	const visible = filterAndSortIdioms(state.idioms.entries, document.getElementById("idiomFilter").value, state.selected, document.getElementById("idiomSelectedOnly").checked, document.getElementById("idiomSort").value, sourceID, level, levelIndex);
	const body = document.getElementById("idiomsBody");
	body.replaceChildren(...visible.map((entry) => renderRow(entry, state.idioms.sources)));
	const source = state.idioms.sources.find((item) => item.id === sourceID);
	const statusSummary = summarizeStatuses(visible);
	document.getElementById("idiomsSummary").textContent = `${visible.length}개 표시 · ${source?.name || `통합 목록 ${state.idioms.total}개`}${statusSummary}`;
	renderSourceDetails(source);
}

function renderRow(entry, sources) {
	const row = document.createElement("tr");
	const statusKey = studyStatusKey(idiomStatusInfo(entry, state.idiomAnkiStatus?.idioms), {unverified: !state.idiomAnkiStatus});
	row.className = `idiom-status-${statusKey}`;
	const level = levelIndex ? idiomLevel(entry, levelIndex) : "";
	const korean = cell(entry.korean, "idiom-korean");
	const hanja = cell("", "vocab-hanja");
	hanja.append(characterStatusLink(entry));
	if (entry.partial) hanja.append(" · 일부 한자 표기");
	row.append(cell(level === "unknown" ? "미상" : level || "—"), sourceInfoCell(entry, sources), hanja, korean);
	return row;
}

function characterStatusLink(entry) {
	const link = insightLink(entry.hanja);
	link.replaceChildren();
	for (const character of Array.from(entry.hanja || "")) {
		if (!/[\u3400-\u9fff\uf900-\ufaff]/u.test(character)) {
			link.append(character);
			continue;
		}
		const info = state.ankiStatus?.characters?.[character.normalize("NFKC")];
		const presentation = studyStatusPresentation(info, {unverified: !state.ankiStatus, absent: Boolean(state.ankiStatus && !info)});
		const characterElement = document.createElement("span");
		characterElement.className = `idiom-status-character ${presentation.classes}`;
		characterElement.textContent = character;
		characterElement.title = presentation.label;
		characterElement.setAttribute("aria-label", `${character} · ${presentation.label}`);
		link.append(characterElement);
	}
	return link;
}

function summarizeStatuses(entries) {
	if (!state.idiomAnkiStatus) return " · 앙키 상태 미확인";
	const counts = {"known-active": 0, "new-active": 0, "known-suspended": 0, "new-suspended": 0, unknown: 0};
	for (const entry of entries) {
		const key = studyStatusKey(idiomStatusInfo(entry, state.idiomAnkiStatus.idioms));
		counts[key]++;
	}
	const suspended = counts["known-suspended"] + counts["new-suspended"];
	return ` · 학습함 ${counts["known-active"]} · 새 카드 ${counts["new-active"]} · 일시 중단 ${suspended} · 상태 없음 ${counts.unknown}`;
}

function sourceInfoCell(entry, sources) {
	const element = cell("", "idiom-info-cell");
	const button = document.createElement("button");
	const sourceNames = entry.sources.map((sourceID) => sources.find((source) => source.id === sourceID)?.shortName || sourceID);
	button.type = "button";
	button.className = "button is-small is-light idiom-info-button";
	button.textContent = `ⓘ ${entry.sources.length}`;
	button.title = `출처: ${sourceNames.join(", ")}`;
	button.setAttribute("aria-label", `${entry.korean} 출처 ${entry.sources.length}개 정보`);
	button.setAttribute("aria-haspopup", "dialog");
	button.setAttribute("aria-expanded", "false");
	button.addEventListener("pointerenter", () => showSourcePopover(button, entry, sources));
	button.addEventListener("pointerleave", scheduleSourcePopoverClose);
	button.addEventListener("focus", () => showSourcePopover(button, entry, sources));
	button.addEventListener("blur", scheduleSourcePopoverClose);
	button.addEventListener("click", (event) => {
		event.stopPropagation();
		showSourcePopover(button, entry, sources);
	});
	element.append(button);
	return element;
}

function showSourcePopover(button, entry, sources) {
	cancelSourcePopoverClose();
	if (sourcePopover?.button === button) return;
	closeSourcePopover();
	const popover = document.createElement("div");
	popover.className = "notification is-light idiom-source-popover p-3";
	popover.setAttribute("role", "dialog");
	popover.setAttribute("aria-label", `${entry.korean} 출처`);
	popover.addEventListener("pointerenter", cancelSourcePopoverClose);
	popover.addEventListener("pointerleave", scheduleSourcePopoverClose);
	const tags = document.createElement("div");
	tags.className = "tags mb-0";
	for (const sourceID of entry.sources) {
		const source = sources.find((item) => item.id === sourceID);
		if (source?.sourceUrl) {
			const link = document.createElement("a");
			link.href = source.sourceUrl;
			link.target = "_blank";
			link.rel = "noreferrer";
			link.className = `tag ${sourceTagClasses(sourceID)}`;
			link.textContent = source.shortName;
			link.title = source.name;
			tags.append(link);
		} else {
			tags.append(tag(source?.shortName || sourceID, sourceTagClasses(sourceID)));
		}
	}
	popover.append(tags);
	document.body.append(popover);
	button.setAttribute("aria-expanded", "true");
	sourcePopover = {button, popover};

	const buttonRect = button.getBoundingClientRect();
	const popoverRect = popover.getBoundingClientRect();
	const gap = 6;
	const left = Math.min(Math.max(gap, buttonRect.right - popoverRect.width), window.innerWidth - popoverRect.width - gap);
	const below = buttonRect.bottom + gap;
	const top = below + popoverRect.height <= window.innerHeight - gap ? below : Math.max(gap, buttonRect.top - popoverRect.height - gap);
	popover.style.left = `${left}px`;
	popover.style.top = `${top}px`;
}

function closeSourcePopover() {
	cancelSourcePopoverClose();
	if (!sourcePopover) return;
	sourcePopover.button.setAttribute("aria-expanded", "false");
	sourcePopover.popover.remove();
	sourcePopover = null;
}

function scheduleSourcePopoverClose() {
	cancelSourcePopoverClose();
	sourcePopoverCloseTimer = window.setTimeout(closeSourcePopover, 150);
}

function cancelSourcePopoverClose() {
	if (sourcePopoverCloseTimer === null) return;
	window.clearTimeout(sourcePopoverCloseTimer);
	sourcePopoverCloseTimer = null;
}

function sourceTagClasses(sourceID) {
	return {exam: "is-link is-light", nikl: "is-info is-light", master_6: "is-primary is-light", onebook_6: "is-warning is-light"}[sourceID] || "is-light";
}

function tag(label, classes) {
	const element = document.createElement("span");
	element.className = `tag ${classes}`;
	element.textContent = label;
	return element;
}

function renderSourceDetails(source) {
	const link = document.getElementById("idiomsSource");
	link.classList.toggle("is-hidden", !source?.sourceUrl);
	if (source?.sourceUrl) {
		link.href = source.sourceUrl;
		link.textContent = `${source.shortName} 출처`;
		link.title = source.name;
	}
	document.getElementById("idiomsLicense").textContent = source?.license || "";
}

document.addEventListener("click", (event) => {
	if (sourcePopover && !sourcePopover.popover.contains(event.target)) closeSourcePopover();
});

document.addEventListener("keydown", (event) => {
	if (event.key === "Escape") closeSourcePopover();
});

window.addEventListener("scroll", closeSourcePopover, true);

function option(value, label) {
	const element = document.createElement("option");
	element.value = value;
	element.textContent = label;
	return element;
}

function cell(value, className = "") {
	const element = document.createElement("td");
	element.textContent = value;
	element.className = className;
	return element;
}
