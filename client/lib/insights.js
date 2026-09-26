import { api } from "./api.js";
import { state } from "./state.js";
import { refreshStatus, renderCatalog } from "./anki.js?v=8";
import { loadStaticJSON } from "./static-data.js";
import { showView } from "./views.js";
import { filterRelated, isHanja, levelFor, normalize, parseText, referenceFor, statusFor, studyInfo } from "./insight-data.js?v=4";

const $ = (id) => document.getElementById(id);
let data;
let analysis;
let entries = [];
let requestID = 0;
let focus = "";
let visibleLimit = 40;
let vocabularyError = "";
let busy = false;

export function openInsights(text) {
	$("insightInput").value = text;
	$("insightFilter").value = "";
	showView("insights");
	$("insightInput").focus();
	return analyze();
}

export function insightLink(text) {
	const link = element("a", text);
	link.href = "#insights";
	link.title = `${text} 한자 탐구`;
	link.setAttribute("aria-label", `${text} 한자 탐구`);
	link.addEventListener("click", (event) => { event.preventDefault(); void openInsights(text); });
	return link;
}

function element(tag, text, className = "") {
	const node = document.createElement(tag);
	if (text != null) node.textContent = text;
	node.className = className;
	return node;
}

function button(text, action, className = "is-light") {
	const node = element("button", text, `button is-small ${className}`);
	node.type = "button";
	node.addEventListener("click", action);
	return node;
}

function addCharacters(characters) {
	for (const char of characters) {
		const catalogChar = state.catalog?.groups.flatMap((group) => group.characters).find((c) => normalize(c) === char);
		state.selected.add(catalogChar || char);
	}
	renderCatalog();
	renderInsights();
}

export function initializeInsights() {
	$("insightForm").addEventListener("submit", (event) => { event.preventDefault(); analyze(); });
	$("insightAddAll").addEventListener("click", () => addCharacters(analysis.characters.map((c) => c.character)));
	document.addEventListener("hanja-anki-ready", ensureAnkiStatus);
	$("insightFilter").addEventListener("input", () => { visibleLimit = 40; renderResults(); });
	$("insightMore").addEventListener("click", () => { visibleLimit += 80; renderResults(); });
	document.addEventListener("hanja-selection-change", renderInsights);
	document.addEventListener("hanja-status-change", renderInsights);

}

async function analyze() {
	const id = ++requestID;
	const text = $("insightInput").value.trim();
	const parsed = parseText(text);
	$("insightFeedback").textContent = "";
	if (!parsed.characters.length || parsed.characters.length > 64) {
		analysis = null;
		busy = false;
		$("insightSubmit").classList.remove("is-loading");
		$("insightResults").classList.add("is-hidden");
		$("insightFeedback").textContent = "한자를 입력하세요 · 서로 다른 한자 최대 64자";
		return;
	}
	analysis = {...parsed, text};
	ensureAnkiStatus();
	entries = [];
	focus = "";
	visibleLimit = 40;
	vocabularyError = "";
	busy = true;
	$("insightResults").classList.remove("is-hidden");
	$("insightSubmit").classList.add("is-loading");
	renderInsights();
	try {
		data ||= await loadStaticJSON("/data/insights.json");
		if (id !== requestID) return;
		renderInsights();
	} catch {
		if (id !== requestID) return;
		$("insightFeedback").textContent = "글자 자료를 불러오지 못했습니다. 분석 버튼을 눌러 다시 시도하세요";
	}
	try {
		const characters = parsed.characters.map(({character}) => character);
		const result = await api("/api/insights/vocab", {method: "POST", body: JSON.stringify({characters})});
		if (id !== requestID) return;
		entries = result.entries || [];
	} catch {
		if (id !== requestID) return;
		vocabularyError = "관련 어휘를 불러오지 못했습니다. 분석 버튼을 눌러 다시 시도하세요";
	} finally {
		if (id === requestID) {
			busy = false;
			$("insightSubmit").classList.remove("is-loading");
			renderInsights();
		}
	}
}

function ensureAnkiStatus() {
	if (analysis && !state.ankiStatus && !state.ankiStatusLoading && $("characterFieldSelect").value) {
		void refreshStatus({silent: true});
	}
}

export function renderInsights() {
	if (!analysis) return;
	const chars = analysis.characters.map((c) => c.character);
	const sounds = [...normalize(analysis.text)].filter(isHanja).map((character) => {
		const ref = referenceFor(character, data);
		return ref.sound || ref.hangul?.join("/") || "?";
	});
	$("insightReading").textContent = sounds.join(" · ");
	$("insightCards").replaceChildren(...analysis.characters.map(renderCard));
	const all = button("전체 글자", () => { focus = ""; visibleLimit = 40; renderInsights(); }, focus ? "is-light" : "is-link");
	all.setAttribute("aria-pressed", String(!focus));
	$("insightFocus").replaceChildren(all, ...chars.map((char) => {
		const node = button(char, () => { focus = char; visibleLimit = 40; renderInsights(); }, focus === char ? "is-link" : "is-light");
		node.setAttribute("aria-pressed", String(focus === char));
		return node;
	}));
	renderResults();
}

function renderCard({character, originals}) {
	const ref = referenceFor(character, data);
	const card = element("article", null, "box insight-card");
	const header = element("div", null, "insight-card-header");
	const info = studyInfo(character, state.ankiStatus);
	const level = levelFor(character, state.catalog) || (state.catalog ? "급수 목록 밖" : "급수 미확인");
	const badge = element("span", `${level} · ${statusFor(character, state.ankiStatus)}`, `tag insight-level ${info.color}`);
	badge.dataset.studyStatus = info.status;
	badge.title = `${character} · ${level} · ${statusFor(character, state.ankiStatus)}${info.status === "absent" ? " · 선택한 앙키 덱에 일치하는 노트가 없습니다" : ""}`;
	header.append(element("h3", originals.join(" / "), "insight-character"), badge);
	card.append(header, element("p", ref.hun || ref.sound || ref.hangul?.join(" / ") || "훈음 자료 없음", "title is-5 mb-3"));
	if (ref.definition) card.append(element("p", ref.definition, "insight-definition mb-2"));
	card.append(element("p", `${ref.radical || "부수 미상"} · ${ref.strokes || ref.unicodeStrokes || "—"}획`, "help"));
	const actions = element("div", null, "buttons mt-4");
	const selected = [...state.selected].some((c) => normalize(c) === character);
	const add = button(selected ? "선택됨" : "+ 선택", () => addCharacters([character]), "is-link is-light");
	add.disabled = selected;
	actions.append(add, button("관련 어휘", () => { focus = character; visibleLimit = 40; renderInsights(); $("insightRelatedTitle").scrollIntoView({block: "start", behavior: "smooth"}); }));
	card.append(actions);
	return card;
}

function renderResults() {
	if (!analysis) return;
	const options = {text: analysis.text, characters: analysis.characters.map((c) => c.character), focus, query: $("insightFilter").value};
	const words = filterRelated(entries, options);
	const idioms = filterRelated(state.idioms?.entries || [], options);
	$("insightVocabSummary").textContent = busy ? "관련 어휘를 불러오는 중…" : vocabularyError || (words.length ? `${words.length}개 · 자주 쓰는 순서` : "관련 어휘가 없습니다");
	$("insightVocabBody").replaceChildren(...words.slice(0, visibleLimit).map((entry) => {
		const row = element("tr");
		const hanja = element("td", null, "vocab-hanja");
		hanja.append(insightLink(entry.hanja));
		row.append(hanja, element("td", entry.hangul), element("td", entry.definitions?.join(" · ") || "뜻 자료 없음"));
		return row;
	}));
	$("insightMore").classList.toggle("is-hidden", words.length <= visibleLimit);
	$("insightIdiomSection").classList.toggle("is-hidden", !idioms.length);
	$("insightIdioms").replaceChildren(...idioms.map((entry) => {
		const row = element("div", null, "insight-idiom");
		const sources = entry.sources.map((id) => state.idioms.sources.find((s) => s.id === id)?.shortName || id).join(" · ");
		row.append(element("span", `${entry.korean} · `), insightLink(entry.hanja));
		row.title = `${sources}${entry.page ? ` · ${entry.page}쪽` : ""}`;
		return row;
	}));
}
