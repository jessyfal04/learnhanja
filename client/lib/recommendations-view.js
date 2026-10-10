import { insightLink } from "./insights.js?v=25";
import { rankChapters } from "./recommendations.js?v=1";
import { state } from "./state.js";
import { loadVocabularyCatalog } from "./vocabulary-data.js?v=3";

const $ = (id) => document.getElementById(id);
let vocabulary;
let vocabularyPromise;
let rankings;
let selectedChapter;

export function initializeRecommendations() {
	document.addEventListener("hanja-status-change", invalidateRecommendations);
	document.addEventListener("hanja-known-words-change", invalidateRecommendations);
	document.addEventListener("hanja-view-change", (event) => {
		if (event.detail.view === "recommendations") void renderRecommendations();
	});
}

export async function renderRecommendations() {
	if ($("recommendationsView").classList.contains("is-hidden")) return;
	const status = $("recommendationsStatus");
	const content = $("recommendationsContent");
	content.classList.add("is-hidden");
	status.classList.remove("is-hidden", "is-danger", "is-warning");
	status.classList.add("is-light");

	const unavailable = prerequisiteMessage();
	if (unavailable) {
		status.textContent = unavailable;
		return;
	}
	if (!vocabulary) {
		status.textContent = "추천에 필요한 어휘 자료를 불러오는 중…";
		try {
			vocabularyPromise ||= loadVocabularyCatalog();
			vocabulary = await vocabularyPromise;
		} catch {
			vocabularyPromise = null;
			status.classList.remove("is-light");
			status.classList.add("is-danger", "is-light");
			status.textContent = "추천에 필요한 어휘 자료를 불러오지 못했습니다. 다시 열어 시도하세요";
			return;
		}
		return renderRecommendations();
	}

	rankings ||= rankChapters({
		ankiStatus: state.ankiStatus,
		knownWords: state.knownWords,
		vocabulary,
		catalog: state.catalog,
	});
	if (!rankings.length) {
		status.textContent = "사용 가능한 암기박사 장을 모두 학습했습니다";
		return;
	}
	const top = rankings.slice(0, 5);
	if (!top.some((entry) => entry.chapter === selectedChapter)) selectedChapter = top[0].chapter;
	status.classList.add("is-hidden");
	content.classList.remove("is-hidden");
	renderChapterRows(top);
	renderCharacterRows(top.find((entry) => entry.chapter === selectedChapter));
}

function prerequisiteMessage() {
	if (state.ankiStatusLoading) return "앙키 한자 상태를 불러오는 중…";
	if (!state.ankiStatus) return "추천에는 앙키 한자 상태가 필요합니다. 연결 탭에서 한자 상태를 불러오세요";
	if (!state.ankiStatus.chapters?.length) return "선택한 한자 노트에서 사용할 수 있는 amgi1 장 정보를 찾지 못했습니다";
	if (!state.knownWordsSource) return "추천에는 Migaku KNOWN 단어 연결이 필요합니다. 연결 탭에서 아는 단어 출처를 연결하세요";
	if (!state.catalog) return "급수별 한자 목록을 준비하는 중…";
	return "";
}

function invalidateRecommendations() {
	rankings = null;
	if (!$("recommendationsView").classList.contains("is-hidden")) void renderRecommendations();
}

function renderChapterRows(top) {
	$("recommendationChapterBody").replaceChildren(...top.map((entry, index) => {
		const row = document.createElement("tr");
		row.classList.add("recommendation-row");
		row.classList.toggle("is-selected", entry.chapter === selectedChapter);
		row.classList.add("is-clickable");
		row.tabIndex = 0;
		row.setAttribute("role", "button");
		row.setAttribute("aria-pressed", String(entry.chapter === selectedChapter));
		row.setAttribute("aria-label", `${entry.chapter}장 추천 세부 정보`);
		const position = cell();
		position.append(label(`#${index + 1}`, index === 0 ? "tag is-link" : "tag is-light"));
		const chapter = cell(`${entry.chapter}장`, "has-text-weight-semibold recommendation-chapter-number");
		const score = cell(`평균 순위 ${entry.finalScore.toFixed(2)}`, "recommendation-score");
		const progress = cell();
		progress.append(label(`남음 ${entry.missingCount}자`, "tag is-warning is-light"));
		const vocabulary = cell();
		vocabulary.append(label(`KNOWN +${entry.vocabUnlockCount}`, "tag is-success is-light"));
		const ranks = cell(null, "recommendation-ranks");
		for (const text of [`완성 #${entry.completionRank}`, `어휘 #${entry.vocabUnlockRank}`, `급수 #${entry.levelFitRank}`, `책 #${entry.bookOrderRank}`]) ranks.append(label(text, "tag is-light"));
		row.append(position, chapter, score, progress, vocabulary, ranks);
		const select = () => {
			selectedChapter = entry.chapter;
			renderChapterRows(top);
			renderCharacterRows(entry);
		};
		row.addEventListener("click", select);
		row.addEventListener("keydown", (event) => {
			if (event.key === "Enter" || event.key === " ") {
				event.preventDefault();
				select();
			}
		});
		return row;
	}));
}

function renderCharacterRows(chapter) {
	$("recommendationCharacterSummary").textContent = `${chapter.chapter}장 · 남음 ${chapter.missingCount}자`;
	$("recommendedCharacter").textContent = chapter.recommendedCharacter;
	$("recommendationCharacterBody").replaceChildren(...chapter.recommendedCharacters.map((entry, index) => {
		const row = document.createElement("tr");
		row.classList.add("recommendation-character-row");
		if (index === 0) row.classList.add("is-selected");
		const character = document.createElement("td");
		character.append(insightLink(entry.character));
		row.append(character, cell(entry.level || "급수 목록 밖"), cell(`KNOWN 어휘 ${entry.contributionCount}개`));
		return row;
	}));
}

function cell(text, className = "") {
	const node = document.createElement("td");
	if (text != null) node.textContent = text;
	node.className = className;
	return node;
}

function label(text, className) {
	const node = document.createElement("span");
	node.className = className;
	node.textContent = text;
	return node;
}
