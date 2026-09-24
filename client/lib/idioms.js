import { renderCatalog } from "./anki.js?v=3";
import { buildLevelIndex, filterAndSortIdioms, idiomCharacters, idiomLevel, idiomStatusInfo } from "./idiom-filter.js";
import { insightLink } from "./insights.js";
import { state } from "./state.js";
import { loadStaticJSON } from "./static-data.js";
import { koreanError, showMessage } from "./ui.js";

let levelIndex = null;

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
	const level = levelIndex ? idiomLevel(entry, levelIndex) : "";
	const korean = cell(entry.korean);
	if (entry.meaning) {
		const meaning = document.createElement("p");
		meaning.className = "help mt-1";
		meaning.textContent = entry.meaning;
		korean.appendChild(meaning);
	}
	const hanja = cell("", "vocab-hanja");
	hanja.append(insightLink(entry.hanja));
	row.append(korean, hanja, cell(level === "unknown" ? "미상" : level || "—"));
	const labels = entry.sources.map((sourceID) => sources.find((source) => source.id === sourceID)?.shortName || sourceID);
	row.append(cell(labels.join(" · ")), cell(entry.page || "—"));
	row.append(statusCell(idiomStatusInfo(entry, state.idiomAnkiStatus?.idioms)));
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

function statusCell(info) {
	if (!state.idiomAnkiStatus) return cell("미확인");
	const labels = {known: "학습함", new: "새 카드", unknown: "상태 없음"};
	const element = cell(info?.suspended ? "일시 중단" : labels[info?.status] || "상태 없음");
	if (info?.suspended) element.className = "has-text-danger";
	else if (info?.status === "known") element.className = "has-text-success";
	else if (info?.status === "new") element.className = "has-text-warning-dark";
	else if (info?.status === "unknown") element.className = "has-text-status-unknown";
	return element;
}

function summarizeStatuses(entries) {
	if (!state.idiomAnkiStatus) return " · 앙키 상태 미확인";
	let known = 0;
	let fresh = 0;
	for (const entry of entries) {
		const status = idiomStatusInfo(entry, state.idiomAnkiStatus.idioms)?.status;
		if (status === "known") known++;
		if (status === "new") fresh++;
	}
	return ` · 학습함 ${known} · 새 카드 ${fresh} · 상태 없음 ${entries.length - known - fresh}`;
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
