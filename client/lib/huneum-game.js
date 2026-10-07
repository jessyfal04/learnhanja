import { state } from "./state.js";
import { loadStaticJSON } from "./static-data.js";
import { shuffled } from "./game-data.js";
import { huneumEntries, huneumQuestion } from "./huneum-game-data.js";
import { ankiCharacterStatus, ankiFields, ankiMetadata, ankiNoteTypes, ankiOpenDeck } from "./anki-connect.js?v=5";
import { preferredDeck } from "./deck-names.js";

const $ = (id) => document.getElementById(id);
let references;
let session;
let huneumDeck = "";
let huneumAnkiStatus = null;
let deckPromise = null;

export function initializeHuneumGame() {
	for (const button of document.querySelectorAll(".huneum-start")) button.addEventListener("click", () => void start(button.dataset.count));
	$("huneumNext").addEventListener("click", nextQuestion);
	$("huneumOpenDeck").addEventListener("click", openDeck);
}

export function prepareHuneumDeck() {
	if (deckPromise) return deckPromise;
	$("huneumDeckStatus").textContent = "앙키 훈음 덱을 찾는 중…";
	deckPromise = (async () => {
		try {
			const metadata = await ankiMetadata();
			const deck = preferredDeck(metadata.decks, ["훈음", "hun eum", "huneum", "hunum"]);
			if (!deck) throw new Error("훈음 덱을 찾지 못했습니다");
			huneumDeck = deck;
			$("huneumOpenDeck").disabled = false;
			$("huneumDeckStatus").textContent = `앙키 덱: ${deck}`;
			const noteTypes = await ankiNoteTypes(deck);
			const noteType = noteTypes.includes("Hanja") ? "Hanja" : noteTypes[0];
			if (!noteType) throw new Error("훈음 덱에서 한자 노트를 찾지 못했습니다");
			const fields = await ankiFields(noteType);
			const field = ["Char", "Hanja", "漢字", "Character"].find((name) => fields.includes(name));
			if (!field) throw new Error("훈음 덱에서 한자 필드를 찾지 못했습니다");
			huneumAnkiStatus = await ankiCharacterStatus({deck, noteType, field});
			$("huneumDeckStatus").textContent = `앙키 덱: ${deck} · 학습한 한자 ${huneumAnkiStatus.known}자`;
			return true;
		} catch (error) {
			huneumAnkiStatus = null;
			$("huneumDeckStatus").textContent = error.message || "앙키 훈음 덱에 연결할 수 없습니다";
			return false;
		} finally {
			deckPromise = null;
		}
	})();
	return deckPromise;
}

async function openDeck() {
	if (!huneumDeck) return;
	try {
		await ankiOpenDeck(huneumDeck);
	} catch (error) {
		$("huneumDeckStatus").textContent = error.message || "앙키 덱을 열 수 없습니다";
	}
}

async function start(count) {
	const startButtons = [...document.querySelectorAll(".huneum-start")];
	for (const button of startButtons) button.disabled = true;
	try {
		const mode = $("huneumMode").value;
		if (mode === "known" && !huneumAnkiStatus && !await prepareHuneumDeck()) return;
		const [levels, insights] = await Promise.all([
			state.catalog ? Promise.resolve(state.catalog) : loadStaticJSON("/data/levels.json"),
			references ? Promise.resolve({characters: references}) : loadStaticJSON("/data/insights.json"),
		]);
		references = insights.characters;
		const entries = huneumEntries(levels, references, huneumAnkiStatus, mode);
		if (new Set(entries.map((entry) => entry.huneum)).size < 4) {
			$("huneumStatus").textContent = "훈음이 서로 다른 한자 4자가 필요합니다. 앙키 훈음 덱을 확인하거나 모든 한자를 선택하세요";
			$("huneumStatus").classList.add("has-text-danger");
			return;
		}
		$("huneumStatus").textContent = `${entries.length.toLocaleString("ko-KR")}자 사용 가능`;
		$("huneumStatus").classList.remove("has-text-danger");
		session = {entries, queue: shuffled(entries), target: count === "continue" ? null : Number(count), answered: 0, correct: 0, question: null};
		$("huneumSetup").classList.add("is-hidden");
		$("huneumSummary").classList.add("is-hidden");
		$("huneumPlay").classList.remove("is-hidden");
		nextQuestion();
	} catch {
		$("huneumStatus").textContent = "훈음 자료를 불러오지 못했습니다. 다시 시도하세요";
		$("huneumStatus").classList.add("has-text-danger");
	} finally {
		for (const button of startButtons) button.disabled = false;
	}
}

function nextQuestion() {
	if (session.target !== null && session.answered >= session.target) return showSummary();
	if (!session.queue.length) session.queue = shuffled(session.entries);
	const entry = session.queue.shift();
	const question = huneumQuestion(entry, session.entries);
	if (!question) return;
	session.question = question;
	$("huneumProgress").textContent = session.target === null ? `${session.answered + 1}번째 문제` : `${session.answered + 1} / ${session.target}`;
	$("huneumScore").textContent = `정답 ${session.correct}`;
	$("huneumTarget").textContent = entry.character;
	$("huneumLevel").textContent = entry.level;
	$("huneumFeedback").className = "notification is-light is-hidden";
	$("huneumFeedback").textContent = "";
	$("huneumNext").classList.add("is-hidden");
	$("huneumChoices").replaceChildren(...question.choices.map((choice) => {
		const button = document.createElement("button");
		button.type = "button";
		button.className = "button is-medium game-huneum-choice";
		button.textContent = choice;
		button.addEventListener("click", () => answer(button, choice));
		return button;
	}));
}

function answer(button, choice) {
	if (button.disabled) return;
	const correct = choice === session.question.correct;
	if (correct) session.correct++;
	session.answered++;
	for (const option of $("huneumChoices").querySelectorAll("button")) {
		option.disabled = true;
		if (option.textContent === session.question.correct) option.classList.add("is-success");
	}
	if (!correct) button.classList.add("is-danger", "is-light");
	const feedback = $("huneumFeedback");
	feedback.className = `notification ${correct ? "is-success" : "is-warning"} is-light`;
	feedback.textContent = correct ? `정답 · ${session.question.correct}` : `정답: ${session.question.correct}`;
	$("huneumScore").textContent = `정답 ${session.correct}`;
	$("huneumNext").textContent = session.target !== null && session.answered >= session.target ? "결과 보기" : "다음";
	$("huneumNext").classList.remove("is-hidden");
}

function showSummary() {
	$("huneumPlay").classList.add("is-hidden");
	$("huneumSummary").classList.remove("is-hidden");
	$("huneumSummaryText").textContent = `${session.answered}문제 중 ${session.correct}문제 정답 · 정답률 ${Math.round(session.correct / session.answered * 100)}%`;
}
