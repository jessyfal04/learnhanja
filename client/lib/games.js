import { state } from "./state.js";
import { loadStaticJSON } from "./static-data.js";
import { loadVocabularyCatalog } from "./vocabulary-data.js?v=3";
import { addExposure, buildBalancedMatchRound, buildMatchRound, buildMixedQuestion, entryKey, gameEntries, knownGameEntries, randomizedGameEntries, shuffled, unknownGameEntries, wordIsKnown } from "./game-data.js";
import { initializeHuneumGame, prepareHuneumDeck } from "./huneum-game.js?v=4";

let catalog = null;
let idiomCatalog = null;
let loading = null;
const exposures = {};
const missed = new Map();
const mixedSession = {queue: [], previous: [], target: 10, answered: 0, correct: 0, streak: 0, attempts: 0, question: null, resolved: false, sourceMode: "vocabulary", wordMode: "known", hanjaMode: "known"};
const matchSession = {board: [], previous: [], completed: new Set(), hangul: null, hanja: null, sourceMode: "vocabulary", wordMode: "known", hanjaMode: "known", size: 4, boards: 0};

const $ = (id) => document.getElementById(id);

export function initializeGames() {
	$("openMixedGame").addEventListener("click", () => openGame("mixed"));
	$("openMatchGame").addEventListener("click", () => openGame("match"));
	$("openHuneumGame").addEventListener("click", () => openGame("huneum"));
	initializeHuneumGame();
	for (const button of document.querySelectorAll(".game-back")) button.addEventListener("click", showGameMenu);
	for (const button of document.querySelectorAll(".mixed-start")) button.addEventListener("click", () => startMixed(button.dataset.count));
	$("mixedNext").addEventListener("click", nextMixedQuestion);
	$("matchStart").addEventListener("click", startMatch);
	$("matchNewBoard").addEventListener("click", nextMatchBoard);
	document.addEventListener("hanja-known-words-change", refreshGameStatus);
	document.addEventListener("hanja-status-change", refreshGameStatus);
	document.addEventListener("hanja-view-change", (event) => {
		if (event.detail.view === "games") void prepareGames();
	});
}

async function prepareGames() {
	if (!catalog || !idiomCatalog) {
		loading ||= Promise.all([loadVocabularyCatalog(), loadStaticJSON("/data/idioms.json")]).then(([entries, idioms]) => {
			catalog = entries;
			const vocabulary = new Map(entries.map((entry) => [entryKey(entry), entry]));
			idiomCatalog = idioms.entries.filter((entry) => !entry.partial && !entry.hanja.includes("-")).map((entry) => ({
				...(vocabulary.get(entryKey({hangul: entry.korean, hanja: entry.hanja})) || {}),
				hangul: entry.korean,
				hanja: entry.hanja,
				kind: "idiom",
				idiomSources: entry.sources,
			}));
		}).finally(() => { loading = null; });
		await loading;
	}
	refreshGameStatus();
}

function pools() {
	if (!catalog) return {known: [], mixed: [], unknown: []};
	return {
		known: knownGameEntries(catalog, state.knownWords, state.ankiStatus),
		mixed: knownGameEntries(catalog, state.knownWords, state.ankiStatus, {requireDefinition: true}),
		unknown: unknownGameEntries(catalog, state.knownWords, state.markedWords, state.ankiStatus, {requireDefinition: true}),
	};
}

function filteredPool(wordMode, hanjaMode, requireDefinition = false) {
	return gameEntries(sourceCatalog("vocabulary"), state.knownWords, state.ankiStatus, {wordMode, hanjaMode, requireDefinition});
}

function sourceCatalog(sourceMode) {
	if (sourceMode === "idioms") return idiomCatalog || [];
	if (sourceMode === "all") {
		const combined = new Map((catalog || []).map((entry) => [entryKey(entry), entry]));
		for (const entry of idiomCatalog || []) if (!combined.has(entryKey(entry))) combined.set(entryKey(entry), entry);
		return [...combined.values()];
	}
	return catalog || [];
}

function filteredSourcePool(sourceMode, wordMode, hanjaMode, requireDefinition = false) {
	return gameEntries(sourceCatalog(sourceMode), state.knownWords, state.ankiStatus, {wordMode, hanjaMode, requireDefinition});
}

function randomizedPool(sourceMode, wordMode, hanjaMode, {previousEntries = [], requireDefinition = false, desired = 4} = {}) {
	if (sourceMode === "all") {
		const vocabulary = randomizedPool("vocabulary", wordMode, hanjaMode, {previousEntries, requireDefinition, desired});
		const idioms = randomizedPool("idioms", wordMode, hanjaMode, {previousEntries, requireDefinition, desired});
		const unique = new Map();
		for (const entry of interleave(vocabulary, idioms)) if (!unique.has(entryKey(entry))) unique.set(entryKey(entry), entry);
		return [...unique.values()];
	}
	if (wordMode !== "all") {
		return randomizedGameEntries(filteredSourcePool(sourceMode, wordMode, hanjaMode, requireDefinition), {
			exposures,
			previousEntries,
			desired,
			markedWords: wordMode === "unknown" ? state.markedWords : new Set(),
		});
	}
	const known = randomizedGameEntries(filteredSourcePool(sourceMode, "known", hanjaMode, requireDefinition), {exposures, previousEntries, desired});
	const unknown = randomizedGameEntries(filteredSourcePool(sourceMode, "unknown", hanjaMode, requireDefinition), {exposures, previousEntries, desired, markedWords: state.markedWords});
	return interleave(known, unknown);
}

function interleave(left, right) {
	const result = [];
	for (let index = 0; index < Math.max(left.length, right.length); index++) {
		if (left[index]) result.push(left[index]);
		if (right[index]) result.push(right[index]);
	}
	return result;
}

function refreshGameStatus() {
	if (!catalog) return;
	$("gamesPoolStatus").classList.remove("has-text-danger");
	const available = pools();
	const missing = [];
	if (!state.ankiStatus) missing.push("앙키 한자 상태");
	if (!state.knownWordsSource) missing.push("Migaku 아는 단어");
	$("gamesPoolStatus").textContent = missing.length
		? `${missing.join(" · ")} 연결이 필요합니다`
		: `어휘 ${catalog.length.toLocaleString("ko-KR")}개 · 사자성어 ${idiomCatalog.length.toLocaleString("ko-KR")}개 · 앙키·Migaku 필터 사용 가능`;
}

async function openGame(name) {
	if (name !== "huneum") await prepareGames();
	else void prepareHuneumDeck();
	$("gamesIntro").classList.add("is-hidden");
	$("gamesMenu").classList.add("is-hidden");
	$("mixedGame").classList.toggle("is-hidden", name !== "mixed");
	$("matchGame").classList.toggle("is-hidden", name !== "match");
	$("huneumGame").classList.toggle("is-hidden", name !== "huneum");
}

function showGameMenu() {
	$("gamesIntro").classList.remove("is-hidden");
	$("gamesMenu").classList.remove("is-hidden");
	$("mixedGame").classList.add("is-hidden");
	$("matchGame").classList.add("is-hidden");
	$("huneumGame").classList.add("is-hidden");
	$("mixedSetup").classList.remove("is-hidden");
	$("mixedPlay").classList.add("is-hidden");
	$("mixedSummary").classList.add("is-hidden");
	$("matchSetup").classList.remove("is-hidden");
	$("matchPlay").classList.add("is-hidden");
	$("huneumSetup").classList.remove("is-hidden");
	$("huneumPlay").classList.add("is-hidden");
	$("huneumSummary").classList.add("is-hidden");
}

function startMixed(count) {
	const sourceMode = $("mixedSourceMode").value;
	const wordMode = $("mixedWordMode").value;
	const hanjaMode = $("mixedHanjaMode").value;
	const pool = filteredSourcePool(sourceMode, wordMode, hanjaMode, true);
	if (!ensurePool(pool, 1, "혼용문에 사용할 수 있는 단어가 없습니다. 앙키와 Migaku 연결을 확인하세요")) return;
	const parsed = Number(count);
	Object.assign(mixedSession, {
		queue: buildMixedQueue(sourceMode, wordMode, hanjaMode, Number.isFinite(parsed) ? parsed : 20, []),
		previous: [],
		target: Number.isFinite(parsed) ? parsed : null,
		answered: 0,
		correct: 0,
		streak: 0,
		attempts: 0,
		question: null,
		resolved: false,
		sourceMode,
		wordMode,
		hanjaMode,
	});
	missed.clear();
	$("mixedSetup").classList.add("is-hidden");
	$("mixedSummary").classList.add("is-hidden");
	$("mixedPlay").classList.remove("is-hidden");
	$("mixedModeLabel").textContent = modeLabel(sourceMode, wordMode, hanjaMode);
	nextMixedQuestion();
}

function buildMixedQueue(sourceMode, wordMode, hanjaMode, count, previousEntries) {
	const randomized = randomizedPool(sourceMode, wordMode, hanjaMode, {previousEntries, requireDefinition: true, desired: count});
	return randomized.slice(0, Math.min(count, randomized.length));
}

function nextMixedQuestion() {
	const hasMissedRetry = mixedSession.queue.some((entry) => missed.has(entryKey(entry)));
	if (mixedSession.target !== null && mixedSession.answered >= mixedSession.target && !hasMissedRetry) return showMixedSummary();
	if (!mixedSession.queue.length) mixedSession.queue.push(...buildMixedQueue(mixedSession.sourceMode, mixedSession.wordMode, mixedSession.hanjaMode, mixedSession.target ? mixedSession.target - mixedSession.answered : 20, mixedSession.previous));
	const entry = mixedSession.queue.shift();
	if (!entry) return showMixedSummary();
	mixedSession.previous = [...mixedSession.previous, entryKey(entry)].slice(-100);
	mixedSession.attempts = 0;
	mixedSession.resolved = false;
	mixedSession.question = buildMixedQuestion(entry, sourceCatalog(mixedSession.sourceMode), {choiceCount: 4, ankiStatus: mixedSession.hanjaMode === "known" ? state.ankiStatus : null});
	addExposure(exposures, entry);
	$("mixedTarget").textContent = entry.hangul;
	$("mixedDefinition").textContent = mixedSession.question.definition;
	$("mixedFeedback").className = "notification is-light is-hidden";
	$("mixedFeedback").replaceChildren();
	$("mixedNext").classList.add("is-hidden");
	const choices = $("mixedChoices");
	choices.replaceChildren(...shuffled(mixedSession.question.choices).map((hanja) => choiceButton(hanja)));
	updateMixedProgress();
}

function choiceButton(hanja) {
	const button = document.createElement("button");
	button.type = "button";
	button.className = "button is-medium game-hanja-choice";
	button.textContent = hanja;
	button.addEventListener("click", () => answerMixed(button, hanja));
	return button;
}

function answerMixed(button, answer) {
	if (button.disabled) return;
	const {question} = mixedSession;
	if (answer === question.correct) {
		if (mixedSession.attempts === 0) {
			mixedSession.correct++;
			mixedSession.streak++;
		} else {
			mixedSession.streak = 0;
		}
		button.classList.add("is-success");
		finishMixedQuestion(false);
		return;
	}
	mixedSession.attempts++;
	mixedSession.streak = 0;
	button.classList.add("is-danger", "is-light");
	button.disabled = true;
	if (mixedSession.attempts >= 2) finishMixedQuestion(true);
	else updateMixedProgress();
}

function finishMixedQuestion(requeue) {
	const {entry, correct} = mixedSession.question;
	mixedSession.answered++;
	mixedSession.resolved = true;
	for (const button of $("mixedChoices").querySelectorAll("button")) {
		button.disabled = true;
		if (button.textContent === correct) button.classList.add("is-success");
	}
	if (requeue) {
		mixedSession.queue.splice(Math.min(3, mixedSession.queue.length), 0, entry);
		missed.set(entryKey(entry), entry);
	}
	const feedback = $("mixedFeedback");
	feedback.className = `notification ${requeue ? "is-warning" : "is-success"} is-light`;
	const answer = document.createElement("p");
	answer.className = "game-result-hanja";
	answer.textContent = correct;
	const hangul = document.createElement("p");
	hangul.textContent = entry.hangul;
	const meaning = document.createElement("p");
	meaning.className = "help";
	meaning.textContent = (entry.meanings || []).join(" · ");
	feedback.replaceChildren(answer, hangul, meaning);
	$("mixedNext").classList.remove("is-hidden");
	updateMixedProgress();
}

function updateMixedProgress() {
	const current = mixedSession.answered + (mixedSession.question && !mixedSession.resolved ? 1 : 0);
	$("mixedProgress").textContent = mixedSession.target === null ? `${current}번째 문제` : `${Math.min(current, mixedSession.target)} / ${mixedSession.target}`;
	$("mixedCorrect").textContent = `정답 ${mixedSession.correct}`;
	$("mixedStreak").textContent = `연속 ${mixedSession.streak}`;
}

function showMixedSummary() {
	$("mixedPlay").classList.add("is-hidden");
	const summary = $("mixedSummary");
	summary.classList.remove("is-hidden");
	const rate = mixedSession.answered ? Math.round(mixedSession.correct / mixedSession.answered * 100) : 0;
	const frequentCharacters = Object.entries(exposures).sort((left, right) => right[1] - left[1]).slice(0, 5).map(([character, count]) => `${character} ×${count}`).join(" · ") || "—";
	const missedWords = Array.from(missed.values(), (entry) => `${entry.hanja} (${entry.hangul})`).join(" · ") || "없음";
	const content = document.createElement("div");
	content.className = "content";
	const heading = document.createElement("h4");
	heading.textContent = `${mixedSession.answered}문제 완료`;
	const accuracy = document.createElement("p");
	accuracy.textContent = `정답률 ${rate}%`;
	const exposureSummary = document.createElement("p");
	exposureSummary.append(summaryLabel("많이 본 한자"), document.createElement("br"), frequentCharacters);
	const missedSummary = document.createElement("p");
	missedSummary.append(summaryLabel("다시 볼 어휘"), document.createElement("br"), missedWords);
	content.append(heading, accuracy, exposureSummary, missedSummary);
	summary.replaceChildren(content);
	const restart = document.createElement("button");
	restart.type = "button";
	restart.className = "button is-link";
	restart.textContent = "다시 시작";
	restart.addEventListener("click", () => {
		summary.classList.add("is-hidden");
		$("mixedSetup").classList.remove("is-hidden");
	});
	summary.append(restart);
}

function summaryLabel(text) {
	const label = document.createElement("strong");
	label.textContent = text;
	return label;
}

function startMatch() {
	matchSession.sourceMode = $("matchSourceMode").value;
	matchSession.wordMode = $("matchWordMode").value;
	matchSession.hanjaMode = $("matchHanjaMode").value;
	matchSession.size = Number($("matchSize").value);
	const pool = filteredSourcePool(matchSession.sourceMode, matchSession.wordMode, matchSession.hanjaMode);
	if (!ensurePool(pool, matchSession.size, `${matchSession.size}쌍을 만들 단어가 부족합니다. 앙키와 Migaku 연결을 확인하세요`)) return;
	Object.assign(matchSession, {previous: [], completed: new Set(), hangul: null, hanja: null, boards: 0});
	$("matchSetup").classList.add("is-hidden");
	$("matchPlay").classList.remove("is-hidden");
	$("matchModeLabel").textContent = modeLabel(matchSession.sourceMode, matchSession.wordMode, matchSession.hanjaMode);
	updateMatchNotice();
	nextMatchBoard();
}

function nextMatchBoard() {
	matchSession.board = buildMatchBoard(matchSession.previous);
	if (matchSession.board.length < matchSession.size) {
		matchSession.board = buildMatchBoard([]);
	}
	matchSession.previous = [...matchSession.previous, ...matchSession.board.map(entryKey)].slice(-matchSession.size * 3);
	matchSession.completed = new Set();
	matchSession.hangul = null;
	matchSession.hanja = null;
	matchSession.boards++;
	$("matchDiscovery").classList.add("is-hidden");
	$("matchProgress").textContent = `${matchSession.boards}번째 판 · 0 / ${matchSession.board.length}`;
	renderMatchColumn("matchHangul", shuffled(matchSession.board), "hangul");
	renderMatchColumn("matchHanja", shuffled(matchSession.board), "hanja");
}

function buildMatchBoard(previousEntries) {
	if (matchSession.wordMode === "all") {
		return buildBalancedMatchRound(
			randomizedPool(matchSession.sourceMode, "known", matchSession.hanjaMode, {previousEntries, desired: matchSession.size}),
			randomizedPool(matchSession.sourceMode, "unknown", matchSession.hanjaMode, {previousEntries, desired: matchSession.size}),
			matchSession.size,
			[],
			{preserveOrder: true},
		);
	}
	const randomized = randomizedPool(matchSession.sourceMode, matchSession.wordMode, matchSession.hanjaMode, {previousEntries, desired: matchSession.size});
	return buildMatchRound(randomized, matchSession.size, [], {preserveOrder: true});
}

function renderMatchColumn(id, entries, side) {
	const column = $(id);
	column.replaceChildren(...entries.map((entry) => {
		const button = document.createElement("button");
		button.type = "button";
		button.className = `button is-fullwidth game-match-card ${side === "hanja" ? "vocab-hanja" : "korean-word"}`;
		button.textContent = entry[side];
		button.dataset.key = entryKey(entry);
		button.addEventListener("click", () => selectMatch(button, entry, side));
		return button;
	}));
}

function selectMatch(button, entry, side) {
	if (matchSession.completed.has(entryKey(entry))) return;
	for (const candidate of $(`match${side === "hangul" ? "Hangul" : "Hanja"}`).querySelectorAll("button")) candidate.classList.remove("is-link");
	button.classList.add("is-link");
	matchSession[side] = {button, entry};
	if (!matchSession.hangul || !matchSession.hanja) return;
	const correct = entryKey(matchSession.hangul.entry) === entryKey(matchSession.hanja.entry);
	if (correct) completeMatch(matchSession.hangul.entry);
	else rejectMatch();
}

function completeMatch(entry) {
	const key = entryKey(entry);
	matchSession.completed.add(key);
	addExposure(exposures, entry);
	for (const side of [matchSession.hangul, matchSession.hanja]) {
		side.button.classList.remove("is-link");
		side.button.classList.add("is-success", "is-light");
		side.button.disabled = true;
	}
	if (!wordIsKnown(entry, state.knownWords)) showDiscovery(entry);
	matchSession.hangul = null;
	matchSession.hanja = null;
	$("matchProgress").textContent = `${matchSession.boards}번째 판 · ${matchSession.completed.size} / ${matchSession.board.length}`;
	if (matchSession.completed.size === matchSession.board.length) {
		$("matchProgress").textContent += " · 완료!";
	}
}

function updateMatchNotice() {
	const notice = $("matchUnknownNotice");
	if (matchSession.wordMode === "known") {
		notice.classList.add("is-hidden");
		return;
	}
	notice.className = `notification ${matchSession.wordMode === "unknown" ? "is-warning" : "is-info"} is-light py-2`;
	notice.textContent = matchSession.wordMode === "unknown"
		? "새로운 어휘입니다. 맞춘 뒤 뜻을 확인하세요"
		: "아는 단어와 모르는 단어를 함께 냅니다. 새로운 어휘는 맞춘 뒤 뜻을 보여 줍니다";
}

function modeLabel(sourceMode, wordMode, hanjaMode) {
	const sources = {vocabulary: "어휘", idioms: "사자성어", all: "어휘·사자성어"};
	const words = {known: "아는 단어", unknown: "모르는 단어", all: "아는·모르는 단어"};
	const hanja = {known: "아는 한자만", all: "모든 한자"};
	return `${sources[sourceMode]} · ${words[wordMode]} · ${hanja[hanjaMode]}`;
}

function rejectMatch() {
	const selections = [matchSession.hangul, matchSession.hanja];
	for (const selection of selections) {
		selection.button.classList.remove("is-link");
		selection.button.classList.add("is-danger", "is-light");
	}
	window.setTimeout(() => {
		for (const selection of selections) selection.button.classList.remove("is-danger", "is-light");
	}, 700);
	matchSession.hangul = null;
	matchSession.hanja = null;
}

function showDiscovery(entry) {
	const element = $("matchDiscovery");
	element.classList.remove("is-hidden");
	const hanja = document.createElement("p");
	hanja.className = "game-result-hanja";
	hanja.textContent = entry.hanja;
	const hangul = document.createElement("p");
	hangul.className = "korean-word";
	hangul.textContent = entry.hangul;
	const definition = document.createElement("p");
	definition.textContent = (entry.definitions || []).join(" · ") || (entry.kind === "idiom" ? "사자성어 · 뜻 정보 없음" : "뜻 정보 없음");
	const english = document.createElement("p");
	english.className = "help";
	english.textContent = (entry.meanings || []).join(" · ");
	element.replaceChildren(hanja, hangul, definition, english);
}

function ensurePool(pool, minimum, message) {
	if (pool.length >= minimum) return true;
	$("gamesPoolStatus").textContent = message;
	$("gamesPoolStatus").classList.add("has-text-danger");
	return false;
}
