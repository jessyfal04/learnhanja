import { api } from "./api.js";
import { renderCatalog } from "./anki.js";
import { filterAndSortIdioms, idiomCharacters } from "./idiom-filter.js";
import { state } from "./state.js";
import { koreanError, showMessage } from "./ui.js";

export async function loadIdioms() {
	try {
		state.idioms = await api("/api/idioms");
		const filter = document.getElementById("idiomSourceFilter");
		filter.replaceChildren(option("all", `전체 통합 (${state.idioms.total})`), ...state.idioms.sources.map((source) => option(source.id, `${source.shortName} (${source.total})`)));
		filter.value = "exam";
		renderIdioms();
	} catch (error) {
		showMessage("danger", koreanError(error, "사자성어 목록을 불러올 수 없습니다"));
	}
}

export function renderIdioms() {
	if (!state.idioms) return;
	const sourceID = document.getElementById("idiomSourceFilter").value;
	const visible = filterAndSortIdioms(state.idioms.entries, document.getElementById("idiomFilter").value, state.selected, document.getElementById("idiomSelectedOnly").checked, document.getElementById("idiomSort").value, sourceID);
	const body = document.getElementById("idiomsBody");
	body.replaceChildren(...visible.map((entry) => renderRow(entry, state.idioms.sources)));
	const source = state.idioms.sources.find((item) => item.id === sourceID);
	document.getElementById("idiomsSummary").textContent = `${visible.length}개 표시 · ${source?.name || `통합 목록 ${state.idioms.total}개`}`;
	renderSourceDetails(source);
}

function renderRow(entry, sources) {
	const row = document.createElement("tr");
	row.append(cell(entry.korean), cell(entry.hanja, "vocab-hanja"));
	const labels = entry.sources.map((sourceID) => sources.find((source) => source.id === sourceID)?.shortName || sourceID);
	row.append(cell(labels.join(" · ")), cell(entry.page || "—"));
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

function renderSourceDetails(source) {
	const link = document.getElementById("idiomsSource");
	link.classList.toggle("is-hidden", !source?.sourceUrl);
	if (source?.sourceUrl) {
		link.href = source.sourceUrl;
		link.textContent = `${source.shortName} 출처`;
		link.title = source.name;
	}
	const details = source ? source.name : state.idioms.sources.map((item) => `${item.name} ${item.total}개`).join(" · ");
	const pageNote = source?.id === "exam" ? " · 쪽수는 원문 기준" : "";
	const license = source?.license ? ` · ${source.license}` : "";
	document.getElementById("idiomsLicense").textContent = `${details}${pageNote}${license}`;
}

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
