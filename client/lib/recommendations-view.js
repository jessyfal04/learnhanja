import { insightLink } from "./insights.js?v=25";
import { buildChapterCandidates, defaultRecommendationWeights, normalizedRecommendationWeights, rankChapterCandidates } from "./recommendations.js?v=2";
import { state } from "./state.js";
import { loadVocabularyCatalog } from "./vocabulary-data.js?v=3";

const $ = (id) => document.getElementById(id);
let vocabulary;
let vocabularyPromise;
let candidates;
let rankings;
let selectedChapter;
const weightControls = {
	completion: ["recommendationCompletionWeight", "recommendationCompletionShare"],
	vocabulary: ["recommendationVocabularyWeight", "recommendationVocabularyShare"],
	level: ["recommendationLevelWeight", "recommendationLevelShare"],
	order: ["recommendationOrderWeight", "recommendationOrderShare"],
};
const importanceLabels = ["중요하지 않음", "낮음", "보통", "중요", "매우 중요"];

export function initializeRecommendations() {
	document.addEventListener("hanja-status-change", invalidateRecommendations);
	document.addEventListener("hanja-known-words-change", invalidateRecommendations);
	document.addEventListener("hanja-catalog-change", invalidateRecommendations);
	for (const [input] of Object.values(weightControls)) {
		$(input).addEventListener("input", updateWeightShares);
		$(input).addEventListener("change", weightsChanged);
	}
	$("recommendationWeightsReset").addEventListener("click", () => {
		for (const [key, [input]] of Object.entries(weightControls)) $(input).value = defaultRecommendationWeights[key];
		weightsChanged();
	});
	updateWeightShares();
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

	candidates ||= buildChapterCandidates({
		ankiStatus: state.ankiStatus,
		knownWords: state.knownWords,
		vocabulary,
		catalog: state.catalog,
	});
	rankings ||= rankChapterCandidates(candidates, currentWeights());
	showRankings();
}

function showRankings() {
	const status = $("recommendationsStatus");
	const content = $("recommendationsContent");
	if (!rankings.length) {
		status.textContent = "추천할 한자가 없습니다. 학습한 한자와 일시 중단되지 않은 새 카드는 추천에서 제외합니다";
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
	candidates = null;
	rankings = null;
	if (!$("recommendationsView").classList.contains("is-hidden")) void renderRecommendations();
}

function currentWeights() {
	return Object.fromEntries(Object.entries(weightControls).map(([key, [input]]) => [key, Number($(input).value)]));
}

function updateWeightShares() {
	const shares = normalizedRecommendationWeights(currentWeights());
	const percentages = Object.fromEntries(Object.entries(shares).map(([key, share]) => [key, Math.floor(share * 100)]));
	const remainder = 100 - Object.values(percentages).reduce((sum, value) => sum + value, 0);
	const order = Object.keys(shares).sort((left, right) => (shares[right] * 100 - percentages[right]) - (shares[left] * 100 - percentages[left]));
	for (const key of order.slice(0, remainder)) percentages[key]++;
	for (const [key, [input, output]] of Object.entries(weightControls)) {
		const label = importanceLabels[Number($(input).value)];
		$(output).textContent = `${label} · ${percentages[key]}%`;
		$(input).setAttribute("aria-valuetext", `${label}, ${percentages[key]}% 비중`);
	}
}

function weightsChanged() {
	updateWeightShares();
	if (!candidates || $("recommendationsView").classList.contains("is-hidden")) return;
	rankings = rankChapterCandidates(candidates, currentWeights());
	showRankings();
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
		const score = cell(entry.finalScore.toFixed(2), "recommendation-score");
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
	$("recommendationCharacterBody").replaceChildren(...chapter.recommendedCharacters.map((entry) => {
		const row = document.createElement("tr");
		row.classList.add("recommendation-character-row");
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
