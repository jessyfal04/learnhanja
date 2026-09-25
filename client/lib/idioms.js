import { renderCatalog } from "./anki.js?v=7";
import { buildLevelIndex, filterAndSortIdioms, idiomCharacters, idiomLevel, idiomStatusInfo } from "./idiom-filter.js";
import { insightLink } from "./insights.js?v=3";
import { state } from "./state.js";
import { loadStaticJSON } from "./static-data.js";
import { studyStatusKey, studyStatusPresentation } from "./study-status.js?v=1";
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
	const hanja = cell("", "vocab-hanja");
	hanja.append(insightLink(entry.hanja));
	row.append(korean, hanja, cell(level === "unknown" ? "미상" : level || "—"));
	row.append(sourceCell(entry.sources, sources), cell(entry.page || "—"));
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
	const presentation = studyStatusPresentation(info, {unverified: !state.idiomAnkiStatus});
	const element = cell("");
	element.append(tag(presentation.label, presentation.classes));
	return element;
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

function sourceCell(sourceIDs, sources) {
	const element = cell("");
	const tags = document.createElement("div");
	tags.className = "tags mb-0";
	for (const sourceID of sourceIDs) {
		const label = sources.find((source) => source.id === sourceID)?.shortName || sourceID;
		const classes = {exam: "is-link is-light", nikl: "is-info is-light", eomunhoe6: "is-primary is-light"}[sourceID] || "is-light";
		tags.append(tag(label, classes));
	}
	element.append(tags);
	return element;
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
