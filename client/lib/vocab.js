import { state } from "./state.js";
import { koreanError, setLoading, showMessage } from "./ui.js";
import { filterAndSortVocabulary, vocabularyKnowledge } from "./vocab-filter.js";
import { showView } from "./views.js?v=1";
import { insightLink } from "./insights.js?v=19";
import { loadVocabularyCatalog, searchVocabulary } from "./vocabulary-data.js?v=2";
import { formatFrequencyRank, frequencyMean, frequencyMedian } from "./frequency.js";
import { fillStatusCharacters } from "./status-characters.js?v=1";

let requestID = 0;
let scheduledBuild;
let frequencyPopover = null;
let frequencyPopoverCloseTimer = null;

export function scheduleVocabulary() {
	requestID++;
	clearTimeout(scheduledBuild);
	scheduledBuild = setTimeout(() => { void buildVocabulary({navigate: false}); }, 250);
}

export async function buildVocabulary({navigate = true} = {}) {
	clearTimeout(scheduledBuild);
	const button = document.getElementById("buildVocabButton");
	const characters = Array.from(state.selected);
	const id = ++requestID;
	if (!characters.length) {
		setLoading(button, false);
		state.vocabulary = [];
		state.vocabularyTotal = 0;
		renderVocabulary();
		return;
	}
	setLoading(button, true);
	try {
		const catalog = await loadVocabularyCatalog();
		const result = searchVocabulary(catalog, characters, 5000);
		if (id !== requestID) return;
		state.vocabulary = result.entries || [];
		state.vocabularyTotal = result.total || 0;
		renderVocabulary();
		if (navigate) showView("vocabulary");
	} catch (error) {
		if (id === requestID) showMessage("danger", koreanError(error, "관련 어휘를 불러올 수 없습니다"));
	} finally {
		if (id === requestID) setLoading(button, false);
	}
}

export function renderVocabulary() {
	closeFrequencyPopover();
	const knowledge = {knownWords: state.knownWordsSource ? state.knownWords : null, markedWords: state.markedWords, ankiStatus: state.ankiStatus};
	const visible = filterAndSortVocabulary(state.vocabulary, document.getElementById("vocabFilter").value, document.getElementById("maxRank").value, document.getElementById("vocabSort").value, knowledge, document.getElementById("vocabKnowledgeFilter").value);
	const body = document.getElementById("vocabBody");
	body.replaceChildren();
	for (const entry of visible) body.appendChild(renderRow(entry, knowledge));
	const statusCounts = visible.reduce((counts, entry) => {
		counts[vocabularyKnowledge(entry, knowledge.knownWords, knowledge.markedWords, knowledge.ankiStatus)]++;
		return counts;
	}, {known: 0, marked: 0, target: 0, unknown: 0, unverified: 0});
	const known = state.knownWordsSource ? ` · 아는 단어 ${statusCounts.known}개 · 표시한 단어 ${statusCounts.marked}개` : "";
	document.getElementById("vocabSummary").textContent = `${visible.length}개 표시 · ${state.vocabulary.length}개 불러옴 · 전체 ${state.vocabularyTotal}개${known}`;
}

function renderRow(entry, knowledge) {
	const row = document.createElement("tr");
	const status = vocabularyKnowledge(entry, knowledge.knownWords, knowledge.markedWords, knowledge.ankiStatus);
	const presentation = {
		known: ["아는 단어", "is-success", "vocab-known"],
		marked: ["표시한 단어", "is-purple", "vocab-marked"],
		target: ["학습 추천", "is-warning", "vocab-target"],
		unknown: ["모르는 단어", "is-light", "vocab-unknown"],
		unverified: ["미확인", "is-light", "vocab-unverified"],
	}[status];
	row.className = presentation[2];
	const hanja = cell("", "vocab-hanja");
	hanja.appendChild(fillStatusCharacters(insightLink(entry.hanja), entry.hanja, state.ankiStatus));
	const badge = document.createElement("span");
	badge.className = `tag ${presentation[1]}`;
	badge.textContent = presentation[0];
	row.append(
		cellWith(badge, "vocab-status"),
		hanja,
		cell(entry.hangul, "korean-word"),
		cell((entry.meanings || []).join(" · ")),
		frequencyCell(entry),
	);
	return row;
}

function frequencyCell(entry) {
	const element = cell("", "frequency-info-cell");
	const mean = frequencyMean(entry);
	const value = document.createElement("span");
	value.className = "frequency-value";
	value.textContent = formatFrequencyRank(mean);
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

function closeFrequencyPopover() {
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

function cellWith(child, className = "") {
	const element = cell("", className);
	element.appendChild(child);
	return element;
}

function cell(value, className = "") {
	const element = document.createElement("td");
	element.textContent = String(value == null ? "" : value);
	if (className) element.className = className;
	return element;
}
