import { state } from "./state.js";
import { koreanError, setLoading, showMessage } from "./ui.js";
import { filterAndSortVocabulary, vocabularyKnowledge } from "./vocab-filter.js";
import { showView } from "./views.js?v=3";
import { insightLink } from "./insights.js?v=22";
import { loadVocabularyCatalog, searchVocabulary } from "./vocabulary-data.js?v=2";
import { fillStatusCharacters } from "./status-characters.js?v=1";
import { closeFrequencyPopover, frequencyCell } from "./frequency-display.js?v=1";

let requestID = 0;
let scheduledBuild;

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
