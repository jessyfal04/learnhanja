import { api } from "./api.js";
import { state } from "./state.js";
import { setLoading, showMessage } from "./ui.js";
import { filterAndSortVocabulary } from "./vocab-filter.js";
import { showView } from "./views.js";

export async function buildVocabulary() {
	const button = document.getElementById("buildVocabButton");
	setLoading(button, true);
	try {
		const result = await api("/api/vocab", {
			method: "POST",
			body: JSON.stringify({ characters: Array.from(state.selected), limit: 5000 }),
		});
		state.vocabulary = result.entries || [];
		state.vocabularyTotal = result.total || 0;
		renderVocabulary();
		showView("vocabulary");
	} catch (error) {
		showMessage("danger", error.message);
	} finally {
		setLoading(button, false);
	}
}

export function renderVocabulary() {
	const visible = filterAndSortVocabulary(state.vocabulary, document.getElementById("vocabFilter").value, document.getElementById("maxRank").value, document.getElementById("vocabSort").value);
	const body = document.getElementById("vocabBody");
	body.replaceChildren();
	for (const entry of visible) body.appendChild(renderRow(entry));
	document.getElementById("vocabSummary").textContent = `${visible.length} shown · ${state.vocabulary.length} loaded · ${state.vocabularyTotal} total matches`;
}

function renderRow(entry) {
	const row = document.createElement("tr");
	row.append(
		cell(entry.hanja, "vocab-hanja"),
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
