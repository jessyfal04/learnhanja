import { state } from "./state.js";
import { refreshStatus, renderCatalog } from "./anki.js?v=13";
import { loadStaticJSON } from "./static-data.js";
import { showView } from "./views.js?v=3";
import { decomposeHanja, filterRelated, hangulCandidates, isHanja, levelFor, normalize, parseText, referenceFor, statusFor, studyInfo } from "./insight-data.js?v=6";
import { urlWithQuery } from "./url-query.js?v=1";
import { loadVocabularyCatalog, relatedVocabulary } from "./vocabulary-data.js?v=3";
import { vocabularyKnowledge } from "./vocab-filter.js";
import { fillStatusCharacters } from "./status-characters.js?v=1";
import { frequencyCell } from "./frequency-display.js?v=1";
import { characterDeckPresentation } from "./character-deck-status.js?v=2";

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
	window.history.replaceState(window.history.state, "", urlWithQuery(window.location.href, text));
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
	document.addEventListener("hanja-aux-status-change", renderInsights);
	document.addEventListener("hanja-known-words-change", renderInsights);

}

async function analyze(forcedHanja = "") {
	const id = ++requestID;
	const text = $("insightInput").value.trim();
	let parsed = parseText(text);
	let vocabularyCatalog;
	let candidates = [];
	$("insightFeedback").textContent = "";
	$("insightFeedback").className = "help has-text-danger";
	$("insightCandidates").classList.add("is-hidden");
	$("insightCandidates").replaceChildren();
	if (!parsed.characters.length && text) {
		busy = true;
		$("insightSubmit").classList.add("is-loading");
		try {
			vocabularyCatalog = await loadVocabularyCatalog();
			if (id !== requestID) return;
			candidates = hangulCandidates(vocabularyCatalog, state.idioms?.entries, text);
		} catch {
			if (id !== requestID) return;
			$("insightFeedback").textContent = "한글 단어 자료를 불러오지 못했습니다. 다시 시도하세요";
			return;
		} finally {
			if (id === requestID) {
				busy = false;
				$("insightSubmit").classList.remove("is-loading");
			}
		}
		if (candidates.length) {
			const selected = candidates.find((entry) => normalize(entry.hanja) === normalize(forcedHanja));
			if (candidates.length > 1 && !selected) {
				renderHangulCandidates(candidates, "");
				analysis = null;
				$("insightResults").classList.add("is-hidden");
				$("insightFeedback").className = "help has-text-info";
				$("insightFeedback").textContent = `${text}의 한자 표기를 선택하세요`;
				return;
			}
			parsed = parseText(selected?.hanja || candidates[0].hanja);
		}
	}
	if (!parsed.characters.length || parsed.characters.length > 64) {
		analysis = null;
		busy = false;
		$("insightSubmit").classList.remove("is-loading");
		$("insightResults").classList.add("is-hidden");
		$("insightFeedback").textContent = "일치하는 한자 표기를 찾지 못했습니다 · 서로 다른 한자 최대 64자";
		return;
	}
	const resolvedHanja = candidates.length ? (forcedHanja || candidates[0].hanja) : "";
	const selectedCandidate = candidates.find((entry) => normalize(entry.hanja) === normalize(resolvedHanja));
	analysis = {
		...parsed,
		text: resolvedHanja || text,
		inputText: text,
		resolvedHanja,
		candidates,
		selectedCandidate,
		composition: selectedCandidate?.composed ? selectedCandidate : null,
	};
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
		const catalog = vocabularyCatalog || await loadVocabularyCatalog();
		if (id !== requestID) return;
		const exact = selectedCandidate || catalog.find((entry) => normalize(entry.hanja) === normalize(analysis.text));
		analysis.composition ||= decomposeHanja(catalog, {hanja: analysis.text, hangul: exact?.hangul}, data);
		entries = relatedVocabulary(catalog, characters);
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

function renderHangulCandidates(candidates, selectedHanja) {
	const container = $("insightCandidates");
	container.classList.remove("is-hidden");
	const choices = element("div", null, "buttons mb-0");
	choices.replaceChildren(...candidates.map((entry) => {
		const selected = normalize(entry.hanja) === normalize(selectedHanja);
		const definition = (entry.definitions || []).join(" · ") || "뜻 자료 없음";
		const choice = button(null, () => { void analyze(entry.hanja); }, `${selected ? "is-link" : "is-light"} insight-candidate`);
		choice.append(element("span", entry.hanja, "vocab-hanja"), element("small", definition));
		choice.setAttribute("aria-pressed", String(selected));
		choice.title = definition;
		return choice;
	}));
	container.replaceChildren(choices);
}

function renderComposition(entry) {
	const composition = element("section", null, "insight-composition");
	composition.append(element("p", "한자어 구성", "label mb-1"), element("p", "한자를 선택해 복사하거나 구성 요소를 Ctrl+클릭해 새 탭에서 탐구하세요", "help mb-3"));
	const expression = element("div", null, "insight-composition-expression");
	entry.components.forEach((component, index) => {
		if (index) expression.append(element("span", "+", "insight-composition-operator"));
		const part = element("div", null, "insight-composition-part");
		const name = element("div", null, "insight-composition-name");
		name.append(element("strong", component.hangul, "korean-word"), compositionLink(component));
		const english = element("p", `영어 · ${component.meaning || "뜻 자료 없음"}`, "help insight-composition-english mb-0");
		english.lang = "en";
		english.translate = true;
		part.append(name, element("p", component.definition || "뜻 자료 없음", "help mb-1"), english);
		expression.append(part);
	});
	expression.append(element("span", "→", "insight-composition-operator"));
	const result = element("div", null, "insight-composition-result");
	result.append(element("strong", entry.hangul, "korean-word"), element("span", entry.hanja, "vocab-hanja"));
	expression.append(result);
	composition.append(expression);
	return composition;
}

function compositionLink(component) {
	const link = element("a", component.hanja, "insight-composition-character");
	link.href = urlWithQuery(window.location.href, component.hangul);
	link.title = `${component.hangul} 한자 탐구 · Ctrl+클릭하면 새 탭에서 열립니다`;
	link.setAttribute("aria-label", `${component.hangul} ${component.hanja} 한자 탐구`);
	link.addEventListener("click", (event) => {
		if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
		event.preventDefault();
		void openInsights(component.hangul);
	});
	return link;
}

function ensureAnkiStatus() {
	if (analysis && !state.ankiStatus && !state.ankiStatusLoading && $("characterFieldSelect").value) {
		void refreshStatus({silent: true});
	}
}

export function renderInsights() {
	if (!analysis) return;
	renderCandidateArea();
	const chars = analysis.characters.map((c) => c.character);
	const sounds = [...normalize(analysis.text)].filter(isHanja).map((character) => {
		const ref = referenceFor(character, data);
		return ref.sound || ref.hangul?.join("/") || "?";
	});
	$("insightReading").textContent = analysis.resolvedHanja ? `${analysis.inputText} → ${analysis.resolvedHanja} · ${sounds.join(" · ")}` : sounds.join(" · ");
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

function renderCandidateArea() {
	const container = $("insightCandidates");
	container.replaceChildren();
	if (analysis.candidates.length > 1) {
		renderHangulCandidates(analysis.candidates, analysis.selectedCandidate?.hanja || "");
	}
	if (analysis.composition) {
		container.classList.remove("is-hidden");
		container.append(renderComposition(analysis.composition));
	}
	container.classList.toggle("is-hidden", !container.childElementCount);
}

function renderCard({character, originals}) {
	const ref = referenceFor(character, data);
	const card = element("article", null, "box insight-card");
	const header = element("div", null, "insight-card-header");
	const info = studyInfo(character, state.ankiStatus);
	const level = levelFor(character, state.catalog) || (state.catalog ? "급수 목록 밖" : "급수 미확인");
	const deckPresentation = characterDeckPresentation(
		deckStatus(character, state.ankiStatus),
		deckStatus(character, state.moyangAnkiStatus),
		deckStatus(character, state.huneumAnkiStatus),
		{moyangReady: Boolean(state.moyangAnkiStatus), huneumReady: Boolean(state.huneumAnkiStatus)},
	);
	const badge = element("span", `${level} · ${statusFor(character, state.ankiStatus)}`, `tag insight-level ${deckPresentation.classes}`);
	badge.dataset.studyStatus = info.status;
	badge.title = `${character} · ${level} · ${deckPresentation.label}${info.status === "absent" ? " · 선택한 앙키 덱에 일치하는 노트가 없습니다" : ""}`;
	const badges = element("div", null, "tags mb-0");
	badges.append(badge);
	const chapter = Object.entries(state.ankiStatus?.characters || {}).find(([value]) => normalize(value) === character)?.[1]?.chapter;
	if (chapter) badges.append(element("span", `암기박사 ${chapter}장`, "tag is-link is-light"));
	header.append(element("h3", originals.join(" / "), "insight-character"), badges);
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

function deckStatus(character, statuses) {
	return Object.entries(statuses?.characters || {}).find(([value]) => normalize(value) === character)?.[1];
}

function renderResults() {
	if (!analysis) return;
	const options = {text: analysis.text, characters: analysis.characters.map((c) => c.character), focus, query: $("insightFilter").value};
	const words = filterRelated(entries, options);
	const idioms = filterRelated(state.idioms?.entries || [], options);
	const knownWords = state.knownWordsSource ? state.knownWords : null;
	$("insightVocabSummary").textContent = busy ? "관련 어휘를 불러오는 중…" : vocabularyError || (words.length ? `${words.length}개 · 자주 쓰는 순서` : "관련 어휘가 없습니다");
	$("insightVocabBody").replaceChildren(...words.slice(0, visibleLimit).map((entry) => {
		const status = vocabularyKnowledge(entry, knownWords, state.markedWords, state.ankiStatus);
		const row = element("tr", null, `vocab-${status}`);
		const hanja = element("td", null, "vocab-hanja");
		const english = element("td", entry.meanings?.join(" · ") || "—");
		if (entry.meanings?.length) {
			english.lang = "en";
			english.translate = true;
		}
		hanja.append(fillStatusCharacters(insightLink(entry.hanja), entry.hanja, state.ankiStatus));
		row.append(hanja, element("td", entry.hangul), element("td", entry.definitions?.join(" · ") || "뜻 자료 없음"), english, frequencyCell(entry));
		return row;
	}));
	$("insightMore").classList.toggle("is-hidden", words.length <= visibleLimit);
	$("insightIdiomSection").classList.toggle("is-hidden", !idioms.length);
	$("insightIdioms").replaceChildren(...idioms.map((entry) => {
		const row = element("div", null, "insight-idiom");
		const sources = entry.sources.map((id) => state.idioms.sources.find((s) => s.id === id)?.shortName || id).join(" · ");
		row.append(element("span", `${entry.korean} · `), insightLink(entry.hanja));
		row.title = sources;
		return row;
	}));
}
