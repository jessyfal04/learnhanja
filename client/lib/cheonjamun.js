import { renderCatalog } from "./anki.js?v=8";
import { filterAndSortSentences, normalizedSet, sentenceProgress, sentenceTokens, statusForToken, statusIndex } from "./cheonjamun-data.js?v=1";
import { openInsights } from "./insights.js?v=8";
import { referenceFor } from "./insight-data.js?v=4";
import { state } from "./state.js";
import { loadStaticJSON } from "./static-data.js";
import { studyStatusPresentation } from "./study-status.js?v=2";
import { koreanError, showMessage } from "./ui.js";

let data = null;
let insights = null;
let loading = null;
let currentStatuses = null;
let currentSelected = new Set();

const $ = (id) => document.getElementById(id);

export function initializeCheonjamun() {
	for (const id of ["cheonjamunFilter", "cheonjamunSort"]) $(id).addEventListener("input", renderCheonjamun);
	document.addEventListener("hanja-selection-change", renderCheonjamun);
	document.addEventListener("hanja-status-change", renderCheonjamun);
	document.addEventListener("hanja-view-change", (event) => {
		if (event.detail.view === "cheonjamun") void loadCheonjamun();
	});
}

async function loadCheonjamun() {
	if (data && insights) return renderCheonjamun();
	if (loading) return loading;
	loading = (async () => {
		try {
			[data, insights] = await Promise.all([
				loadStaticJSON("/data/cheonjamun.json"),
				loadStaticJSON("/data/insights.json"),
			]);
			renderCheonjamun();
		} catch (error) {
			showMessage("danger", koreanError(error, "천자문 자료를 불러올 수 없습니다"));
			$("cheonjamunSummary").textContent = "천자문 자료를 불러오지 못했습니다";
		} finally {
			loading = null;
		}
	})();
	return loading;
}

export function renderCheonjamun() {
	if (!data || !insights) return;
	const catalog = new Set(state.catalog?.groups.flatMap((group) => group.characters) || []);
	const options = {
		filter: $("cheonjamunFilter").value,
		sort: $("cheonjamunSort").value,
		statuses: state.ankiStatus,
		selected: state.selected,
		catalog,
	};
	currentStatuses = state.ankiStatus ? statusIndex(state.ankiStatus) : null;
	currentSelected = normalizedSet(state.selected);
	const visible = filterAndSortSentences(data.sentences, options);
	const overall = sentenceProgress({phrases: [data.sentences.flatMap((sentence) => sentenceTokens(sentence)), []]}, options);
	$("cheonjamunSummary").textContent = `${visible.length}개 문장 표시`;
	const progress = $("cheonjamunProgress");
	progress.replaceChildren(
		element("span", overall.verified ? `앙키 학습 ${overall.known} / ${overall.total}` : "앙키 상태 미확인", `tag ${overall.verified ? "is-success is-light" : "is-dark is-light"}`),
		element("span", `어휘 선택 ${overall.selected} / ${overall.total}`, "tag is-link is-light"),
		element("span", `어문회 급수 포함 ${overall.cataloged} / ${overall.total}`, "tag is-light"),
	);
	$("cheonjamunList").replaceChildren(...visible.map(({sentence, progress}) => renderSentence(sentence, progress)));
}

function renderSentence(sentence, progress) {
	const card = element("article", "", "box cheonjamun-sentence");
	const header = element("div", "", "cheonjamun-sentence-header");
	const rangeStart = (sentence.number - 1) * 8 + 1;
	const heading = element("div");
	heading.append(element("h3", `${sentence.number}번째 문장`, "title is-6 mb-0"), element("p", `${rangeStart}–${rangeStart + 7}번째 글자`, "help"));
	const sentenceStatus = element("div", "", "tags mb-0");
	if (progress.verified) sentenceStatus.append(element("span", `학습 ${progress.known}/8`, "tag is-success is-light"));
	else sentenceStatus.append(element("span", "앙키 미확인", "tag is-dark is-light"));
	sentenceStatus.append(element("span", `어휘 선택 ${progress.selected}/8`, "tag is-link is-light"));
	header.append(heading, sentenceStatus);
	const text = element("div", "", "cheonjamun-text");
	const reading = element("div", "", "cheonjamun-reading");
	for (const [phraseIndex, phrase] of sentence.phrases.entries()) {
		const phraseElement = element("span", "", "cheonjamun-phrase");
		const readingElement = element("span", "", "cheonjamun-reading-phrase");
		for (const token of phrase) {
			phraseElement.append(characterLink(token));
			readingElement.append(element("span", readingFor(token), "cheonjamun-sound"));
		}
		text.append(phraseElement);
		reading.append(readingElement);
		if (phraseIndex === 0) {
			text.append(element("span", "　", "cheonjamun-gap"));
			reading.append(element("span", "　", "cheonjamun-gap"));
		}
	}
	const actions = element("div", "", "buttons are-small mt-4 mb-0");
	const tokens = sentenceTokens(sentence);
	actions.append(
		actionButton("8자를 어휘 선택에 추가", () => addTokens(tokens), "is-link is-light"),
		actionButton("문장 전체 탐구", () => void openInsights(tokens.map((token) => token.match).join(""))),
	);
	card.append(header, text, reading, actions);
	return card;
}

function characterLink(token) {
	const info = statusForToken(token, currentStatuses);
	const presentation = studyStatusPresentation(info, {unverified: !state.ankiStatus, absent: Boolean(state.ankiStatus && !info)});
	const link = element("a", token.display, `cheonjamun-character ${presentation.classes}`);
	link.href = "#insights";
	const mapping = token.display === token.match ? "" : ` · 학습 연결 ${token.match}`;
	const variants = token.variants?.length ? ` · 이문 ${token.variants.join("/")}` : "";
	link.title = `${presentation.label}${mapping}${variants}`;
	link.setAttribute("aria-label", `${token.display} 한자 탐구 · ${presentation.label}${mapping}`);
	link.addEventListener("click", (event) => {
		event.preventDefault();
		void openInsights(token.match);
	});
	if (currentSelected.has(token.match.normalize("NFKC"))) link.classList.add("is-selected");
	if (token.display !== token.match) link.dataset.match = token.match;
	return link;
}

function readingFor(token) {
	const reference = referenceFor(token.match, insights);
	return token.reading || reference.sound || reference.hangul?.[0] || "?";
}

function addTokens(tokens) {
	for (const token of tokens) state.selected.add(token.match);
	renderCatalog();
}

function actionButton(label, action, classes = "is-light") {
	const button = element("button", label, `button ${classes}`);
	button.type = "button";
	button.addEventListener("click", action);
	return button;
}

function element(tagName, text = "", className = "") {
	const node = document.createElement(tagName);
	node.textContent = text;
	node.className = className;
	return node;
}
