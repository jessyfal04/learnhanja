import { loadStaticJSON } from "./static-data.js";
import { bindHoldButton } from "./hold-button.js?v=1";

const $ = (id) => document.getElementById(id);
const HISTORY_KEY = "learnhanja-topik-reading-history-v1";
const LABELS = ["①", "②", "③", "④"];
let catalog;
let paper;
let answers;
let position = 0;
let startedAt = 0;
let timer;
let loading;
let parts;
let activePart;
let nextUnit = 0;
let loadingQuestion = false;

export function scoreTopikReading(paper, responses) {
	if (!paper.questions.length || paper.questions.length !== responses.length) throw new Error("TOPIK 읽기 문항 수가 올바르지 않습니다");
	const correct = paper.questions.map((question, index) => responses[index] === question.answer);
	return {correct, answered: responses.filter((answer) => answer !== null).length, points: correct.filter(Boolean).length * 2, maxPoints: paper.questions.length * 2};
}

function history() {
	try {
		const parsed = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
		return Array.isArray(parsed) ? parsed : [];
	} catch { return []; }
}

function renderHistory() {
	const target = $("topikHistory");
	const records = history().slice(-10).reverse();
	target.replaceChildren();
	if (!records.length) { target.textContent = "저장된 결과가 없습니다."; return; }
	const list = document.createElement("ul");
	for (const record of records) {
		const item = document.createElement("li");
		item.textContent = `${record.paper} · ${record.points}/${record.maxPoints || 100}점 · ${record.answered}/${record.count || 50}문항 답함 · ${new Date(record.at).toLocaleDateString("ko-KR")}`;
		list.append(item);
	}
	target.append(list);
}

export function initializeTopikExam() {
	$("topikStart").addEventListener("click", start);
	$("topikSource").addEventListener("change", () => { renderSource(); if ($("topikSource").value === "paper") loadPapers(); });
	$("topikNext").addEventListener("click", () => { void next(); });
	bindHoldButton($("topikFinish"), () => Boolean(paper && answers), finish);
	$("topikAgain").addEventListener("click", showSetup);
	document.addEventListener("keydown", (event) => {
		if (!paper || $("topikView").classList.contains("is-hidden") || $("topikPlay").classList.contains("is-hidden") || ["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement?.tagName)) return;
		if (/^[1-4]$/.test(event.key)) choose(Number(event.key) - 1);
		if (event.key === "ArrowRight") void next();
	});
	const loadPapers = () => {
		if (catalog || loading) return;
		$("topikSetupStatus").textContent = "시험지를 불러오는 중…";
		loading = loadStaticJSON("/data/topik-reading.json").then((data) => {
		if (!Array.isArray(data.papers) || !data.papers.every((entry) => entry.questions?.length === 50)) throw new Error("시험지 자료가 올바르지 않습니다");
		catalog = data;
		$("topikPaper").replaceChildren(...[...data.papers].sort((a, b) => Number(b.id.match(/\d+/)?.[0]) - Number(a.id.match(/\d+/)?.[0])).map((entry) => new Option(entry.title, entry.id)));
		$("topikSetupStatus").textContent = `${data.papers.length}개 기출 시험지 준비됨`;
		}).catch(() => { $("topikSetupStatus").textContent = "TOPIK 자료를 불러올 수 없습니다. 로컬 EPUB 추출 파일을 확인하세요."; }).finally(() => { loading = null; });
	};
	document.addEventListener("hanja-view-change", (event) => {
		if (event.detail?.view !== "topik" || parts) return;
		void fetch("/api/topik/parts").then((response) => { if (!response.ok) throw new Error("파트 목록을 불러올 수 없습니다"); return response.json(); }).then((value) => {
			parts = value;
			$("topikPart").replaceChildren(...parts.map((part) => new Option(`${part.start}–${part.end}번 · ${part.label}`, part.id)));
			$("topikSetupStatus").textContent = `${parts.length}개 AI 문항 파트 준비됨`;
			renderSource();
		}).catch(() => { $("topikSetupStatus").textContent = "AI 문항 파트를 불러올 수 없습니다"; });
	});
	$("topikStart").disabled = true;
	renderHistory();
	function renderSource() {
		const isAI = $("topikSource").value === "ai";
		$("topikPartField").classList.toggle("is-hidden", !isAI);
		$("topikPaperField").classList.toggle("is-hidden", isAI);
		$("topikStart").disabled = isAI ? !parts : !catalog;
		$("topikStart").textContent = isAI ? "AI 한 문제씩 시작" : "기출 한 문제씩 시작";
	}
}

async function generateUnit(part, unit) {
	const response = await fetch("/api/topik/generate", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({part: part.id, unit})});
	if (!response.ok) throw new Error(response.status === 503 ? "서버의 AI 생성 설정을 확인하세요" : response.status === 429 ? "생성 한도에 도달했습니다. 잠시 후 다시 시도하세요" : "문항을 검증하지 못했습니다. 다시 시도하세요");
	const value = await response.json();
	const first = part.start + part.units.slice(0, unit).reduce((sum, size) => sum + size, 0);
	if (value.questions?.length !== part.units[unit] || value.questions.some((question, index) => question.number !== first + index)) throw new Error("생성된 문항 수가 올바르지 않습니다");
	return value;
}

async function start() {
	const button = $("topikStart");
	button.disabled = true;
	button.classList.add("is-loading");
	$("topikSetupStatus").textContent = "문항을 만들고 검증하는 중…";
	try {
		if ($("topikSource").value === "ai") {
			const selected = parts.find((part) => part.id === $("topikPart").value);
			if (!selected) throw new Error("문항 파트를 선택하세요");
			const generated = await generateUnit(selected, 0);
			paper = {id: generated.id, title: generated.title, part: selected.id, questions: generated.questions};
			activePart = selected;
			nextUnit = 1 % selected.units.length;
		} else {
			paper = catalog?.papers.find((entry) => entry.id === $("topikPaper").value);
			activePart = null;
		}
		if (!paper) throw new Error("시험지를 선택하세요");
	} catch (error) {
		$("topikSetupStatus").textContent = error.message;
		return;
	} finally {
		button.classList.remove("is-loading");
		button.disabled = false;
	}
	answers = Array(paper.questions.length).fill(null);
	position = 0;
	startedAt = Date.now();
	$("topikSetup").classList.add("is-hidden");
	$("topikResult").classList.add("is-hidden");
	$("topikPlay").classList.remove("is-hidden");
	clearInterval(timer);
	timer = setInterval(tick, 250);
	tick();
	render();
}

function tick() {
	if (!paper || !answers) return;
	const elapsed = Math.floor((Date.now() - startedAt) / 1000);
	$("topikTimer").textContent = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;
}

function appendParagraphs(target, lines) {
	target.replaceChildren();
	for (const line of lines) {
		const paragraph = document.createElement("p");
		paragraph.textContent = line;
		target.append(paragraph);
	}
}

function render() {
	const question = paper.questions[position];
	$("topikProgress").textContent = `${paper.title} · ${position + 1}번째 문제`;
	$("topikInstruction").textContent = question.instruction;
	appendParagraphs($("topikStimulus"), question.shared);
	appendParagraphs($("topikPrompt"), question.prompt);
	for (const image of question.images) {
		const element = document.createElement("img");
		element.src = image;
		element.alt = `${question.number}번 문항 자료`;
		element.className = "topik-image";
		$("topikPrompt").append(element);
	}
	$("topikQuestionNumber").textContent = `${question.number}번`;
	$("topikChoices").replaceChildren(...question.choices.map((choice, index) => {
		const button = document.createElement("button");
		button.type = "button";
		button.className = "button is-light mock-choice";
		const number = document.createElement("span");
		number.className = "mock-choice-number";
		number.textContent = LABELS[index];
		const words = document.createElement("span");
		words.className = "mock-choice-text";
		words.textContent = choice;
		button.append(number, words);
		button.setAttribute("aria-pressed", String(answers[position] === index));
		if (answers[position] !== null) {
			button.disabled = true;
			if (index === question.answer) button.classList.add("is-correct");
			else if (index === answers[position]) button.classList.add("is-wrong");
		}
		button.addEventListener("click", () => choose(index));
		return button;
	}));
	const feedback = $("topikFeedback");
	feedback.classList.toggle("is-hidden", answers[position] === null);
	if (answers[position] !== null) {
		feedback.className = `notification is-light mock-feedback ${answers[position] === question.answer ? "is-success" : "is-danger"} mt-4`;
		feedback.textContent = `${answers[position] === question.answer ? "정답이에요!" : `아쉬워요. 정답은 ${LABELS[question.answer]}입니다.`} ${question.explanation || ""}`;
	}
	$("topikNext").disabled = answers[position] === null || loadingQuestion;
	$("topikNext").textContent = !activePart && position === paper.questions.length - 1 ? "연습 종료 →" : "다음 문제 →";
}

function choose(index) {
	if (!answers || answers[position] !== null || loadingQuestion) return;
	answers[position] = index;
	render();
}

async function next() {
	if (!answers || answers[position] === null || loadingQuestion) return;
	$("topikNextStatus").textContent = "";
	if (position + 1 < paper.questions.length) { position++; render(); return; }
	if (!activePart) { finish(); return; }
	loadingQuestion = true;
	const currentPaper = paper;
	$("topikNext").classList.add("is-loading");
	try {
		const generated = await generateUnit(activePart, nextUnit);
		if (!answers || paper !== currentPaper) return;
		paper.questions.push(...generated.questions);
		answers.push(...generated.questions.map(() => null));
		nextUnit = (nextUnit + 1) % activePart.units.length;
		position++;
	} catch (error) {
		if (paper === currentPaper) $("topikNextStatus").textContent = `${error.message} 다음 문제를 다시 눌러 주세요.`;
	} finally {
		loadingQuestion = false;
		$("topikNext").classList.remove("is-loading");
		if (answers && paper === currentPaper) render();
	}
}

function finish() {
	if (!paper || !answers) return;
	clearInterval(timer);
	const count = answers[position] === null ? position : position + 1;
	const shown = { ...paper, questions: paper.questions.slice(0, count) };
	const shownAnswers = answers.slice(0, count);
	if (!count) { showSetup(); return; }
	const result = scoreTopikReading(shown, shownAnswers);
	const elapsedSeconds = Math.floor((Date.now() - startedAt) / 1000);
	const record = {paper: paper.title, paperId: paper.id, points: result.points, maxPoints: result.maxPoints, count: shown.questions.length, answered: result.answered, elapsedSeconds, at: new Date().toISOString(), answers: shownAnswers, source: paper.part ? "ai" : "paper"};
	try { localStorage.setItem(HISTORY_KEY, JSON.stringify([...history().slice(-49), record])); } catch {}
	$("topikPlay").classList.add("is-hidden");
	$("topikResult").classList.remove("is-hidden");
	$("topikScore").textContent = `읽기 ${result.points} / ${result.maxPoints}점`;
	$("topikResultMeta").textContent = `${paper.title} · ${result.answered}/${shown.questions.length}문항 답함 · ${Math.floor(elapsedSeconds / 60)}분 ${elapsedSeconds % 60}초 소요`;
	$("topikBreakdown").textContent = `${result.correct.filter(Boolean).length}/${shown.questions.length} 정답`;
	const review = $("topikReview");
	review.replaceChildren(...shown.questions.map((question, index) => {
		const details = document.createElement("details");
		const summary = document.createElement("summary");
		summary.textContent = `${question.number}번 ${result.correct[index] ? "정답" : answers[index] === null ? "미응답" : "오답"} · 내 답 ${answers[index] === null ? "—" : LABELS[answers[index]]} · 정답 ${LABELS[question.answer]}`;
		summary.className = result.correct[index] ? "has-text-success" : "has-text-danger";
		details.append(summary);
		for (const line of [...question.shared, ...question.prompt]) {
			const paragraph = document.createElement("p");
			paragraph.textContent = line;
			details.append(paragraph);
		}
		for (const image of question.images) {
			const element = document.createElement("img");
			element.src = image;
			element.alt = `${question.number}번 문항 자료`;
			element.className = "topik-image";
			details.append(element);
		}
		for (const [choiceIndex, choice] of question.choices.entries()) {
			const paragraph = document.createElement("p");
			paragraph.textContent = `${LABELS[choiceIndex]} ${choice}`;
			if (choiceIndex === question.answer) paragraph.className = "has-text-success has-text-weight-bold";
			details.append(paragraph);
		}
		if (question.explanation) {
			const explanation = document.createElement("p");
			explanation.textContent = `해설: ${question.explanation}`;
			details.append(explanation);
		}
		return details;
	}));
	answers = null;
}

function showSetup() {
	clearInterval(timer);
	paper = null;
	answers = null;
	$("topikResult").classList.add("is-hidden");
	$("topikSetup").classList.remove("is-hidden");
	$("topikPlay").classList.add("is-hidden");
	$("topikNextStatus").textContent = "";
	renderHistory();
}
