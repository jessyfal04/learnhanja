import { api } from "./api.js";
import { renderCatalog } from "./anki.js";
import { filterAndSortIdioms, idiomCharacters } from "./idiom-filter.js";
import { state } from "./state.js";
import { showMessage } from "./ui.js";

export async function loadIdioms() {
	try {
		state.idioms = await api("/api/idioms");
		const source = document.getElementById("idiomsSource");
		source.href = state.idioms.sourceUrl;
		source.title = state.idioms.source;
		document.getElementById("idiomsLicense").textContent = state.idioms.license;
		renderIdioms();
	} catch (error) {
		showMessage("danger", error.message);
	}
}

export function renderIdioms() {
	if (!state.idioms) return;
	const visible = filterAndSortIdioms(state.idioms.entries, document.getElementById("idiomFilter").value, state.selected, document.getElementById("idiomSelectedOnly").checked, document.getElementById("idiomSort").value);
	const body = document.getElementById("idiomsBody");
	body.replaceChildren(...visible.map(renderRow));
	document.getElementById("idiomsSummary").textContent = `${visible.length} shown · ${state.idioms.total} NIKL entries`;
}

function renderRow(entry) {
	const row = document.createElement("tr");
	row.append(cell(entry.korean), cell(entry.hanja, "vocab-hanja"));
	const characters = Array.from(new Set(idiomCharacters(entry)));
	const covered = characters.filter((character) => state.selected.has(character)).length;
	row.append(cell(`${covered}/${characters.length}${entry.partial ? " · partial notation" : ""}`));
	const action = document.createElement("td");
	const button = document.createElement("button");
	button.type = "button";
	button.className = "button is-small is-link is-light";
	button.textContent = "Select Hanja";
	button.addEventListener("click", () => {
		for (const character of characters) state.selected.add(character);
		renderCatalog();
		renderIdioms();
	});
	action.appendChild(button);
	row.appendChild(action);
	return row;
}

function cell(value, className = "") {
	const element = document.createElement("td");
	element.textContent = value;
	element.className = className;
	return element;
}
