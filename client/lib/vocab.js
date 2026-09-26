import { state } from "./state.js";
import { koreanError, setLoading, showMessage } from "./ui.js";
import { filterAndSortVocabulary } from "./vocab-filter.js";
import { showView } from "./views.js";
import { insightLink } from "./insights.js?v=7";
import { loadVocabularyCatalog, searchVocabulary } from "./vocabulary-data.js?v=1";

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
	const visible = filterAndSortVocabulary(state.vocabulary, document.getElementById("vocabFilter").value, document.getElementById("maxRank").value, document.getElementById("vocabSort").value);
	const body = document.getElementById("vocabBody");
	body.replaceChildren();
	for (const entry of visible) body.appendChild(renderRow(entry));
	document.getElementById("vocabSummary").textContent = `${visible.length}개 표시 · ${state.vocabulary.length}개 불러옴 · 전체 ${state.vocabularyTotal}개`;
}

function renderRow(entry) {
	const row = document.createElement("tr");
	const hanja = cell("", "vocab-hanja");
	hanja.appendChild(insightLink(entry.hanja));
	row.append(
		hanja,
		cell(entry.hangul),
		cell((entry.meanings || []).join(" · ")),
		cell(entry.pokemonRank || ""),
		cell(entry.niklRank || ""),
	);
	return row;
}

function cell(value, className = "") {
	const element = document.createElement("td");
	element.textContent = String(value == null ? "" : value);
	if (className) element.className = className;
	return element;
}
