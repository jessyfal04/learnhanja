import { api } from "./api.js";
import { renderCatalog } from "./anki.js";
import { filterAndSortIdioms, idiomCharacters } from "./idiom-filter.js";
import { state } from "./state.js";
import { koreanError, showMessage } from "./ui.js";

export async function loadIdioms() {
	try {
		state.idioms = await api("/api/idioms");
		const source = document.getElementById("idiomsSource");
		source.href = state.idioms.sourceUrl;
		source.title = "국립국어원 한국어 교육 어휘 내용 개발 3단계 제4장 3절";
		document.getElementById("idiomsLicense").textContent = state.idioms.license;
		renderIdioms();
	} catch (error) {
		showMessage("danger", koreanError(error, "사자성어 목록을 불러올 수 없습니다"));
	}
}

export function renderIdioms() {
	if (!state.idioms) return;
	const visible = filterAndSortIdioms(state.idioms.entries, document.getElementById("idiomFilter").value, state.selected, document.getElementById("idiomSelectedOnly").checked, document.getElementById("idiomSort").value);
	const body = document.getElementById("idiomsBody");
	body.replaceChildren(...visible.map(renderRow));
	document.getElementById("idiomsSummary").textContent = `${visible.length}개 표시 · 국립국어원 목록 ${state.idioms.total}개`;
}

function renderRow(entry) {
	const row = document.createElement("tr");
	row.append(cell(entry.korean), cell(entry.hanja, "vocab-hanja"));
	const characters = Array.from(new Set(idiomCharacters(entry)));
	const covered = characters.filter((character) => state.selected.has(character)).length;
	row.append(cell(`${covered}/${characters.length}${entry.partial ? " · 일부 한자 표기" : ""}`));
	const action = document.createElement("td");
	const button = document.createElement("button");
	button.type = "button";
	button.className = "button is-small is-link is-light";
	button.textContent = "한자 선택";
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
