import { examGroups, examWordsForLevel, makeExam, makeQuestion, scoreExam, scoreQuestions, secureRandom } from "./mock-exam-data.js?v=2";
import { answerStatus, buildReportHTML, formatDuration, weaknessLines } from "./mock-exam-report.js?v=2";
import { mockExamLevel, mockExamLevels, mockExamPath } from "./mock-exam-levels.js?v=2";
import { loadStaticJSON } from "./static-data.js";
import { koreanError, showMessage } from "./ui.js";
import { loadVocabularyCatalog } from "./vocabulary-data.js?v=3";
import { bindHoldButton } from "./hold-button.js?v=1";

const $ = (id) => document.getElementById(id);
let data = null;
let examConfigsPromise = null;
let mode = "single";
let session = null;
let clock = null;
let cancelStopHold = () => {};
let cancelRestartHold = () => {};

const rangeLabel = (group) => `${group.startIndex + 1}${group.count > 1 ? `–${group.endIndex + 1}` : ""}번`;

export function initializeMockExam() {
	const levelSelect = $("mockLevel");
	levelSelect.replaceChildren(...mockExamLevels.map((level) => new Option(level.label, level.value)));
	$("mockLevelHelp").textContent = `현재 ${mockExamLevels.map((level) => level.label).join(" · ")} 제공`;
	levelSelect.addEventListener("change", () => { void prepareLevel().catch((error) => showMessage("danger", koreanError(error, "급수별 문항을 불러올 수 없습니다"))); });
	void prepareLevel().catch((error) => { $("mockSetupStatus").textContent = koreanError(error, "문항 자료를 불러올 수 없습니다"); });
	$("mockModeSingle").addEventListener("click", () => chooseMode("single"));
	$("mockModeFull").addEventListener("click", () => chooseMode("full"));
	$("mockStart").addEventListener("click", start);
	$("mockPrevious").addEventListener("click", () => move(-1));
	$("mockNext").addEventListener("click", () => move(1));
	cancelStopHold = bindHoldButton($("mockFinish"), () => session?.mode === "single", finish);
	cancelRestartHold = bindHoldButton($("mockAgain"), () => true, showSetup);
	$("mockDownload").addEventListener("click", downloadReport);
	document.addEventListener("keydown", (event) => {
		if (!session || session.finishedAt || $("mockExamView").classList.contains("is-hidden") || ["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement?.tagName)) return;
		if (/^[1-5]$/.test(event.key)) {
			const question = session.questions[session.index];
			chooseAnswer(question.choices[Number(event.key) - 1]);
		}
		if (event.key === "ArrowRight") move(1);
		if (event.key === "ArrowLeft") move(-1);
	});
}

async function prepareLevel() {
	const level = mockExamLevel($("mockLevel").value);
	if (!level) throw new Error("시험 급수를 선택하세요");
	examConfigsPromise ||= loadStaticJSON(mockExamPath).catch((error) => { examConfigsPromise = null; throw error; });
	const levelData = (await examConfigsPromise)[level.value];
	if (!levelData) throw new Error("선택한 급수의 시험 자료가 없습니다");
	if (!Array.isArray(levelData.format?.sections)) throw new Error("시험 유형 구성이 없습니다");
	if ($("mockLevel").value === level.value) {
		data = levelData;
		$("mockSetupStatus").textContent = "";
		$("mockKicker").textContent = `SANGONG PRACTICE LAB · ${level.label}`;
		$("mockHeroMark").textContent = level.label;
		$("mockDescription").textContent = `기출 문항 유형과 순서를 바탕으로, ${level.label} 한자와 한자어에서 새 문제를 만듭니다.`;
		const groups = examGroups(levelData);
		const count = groups.reduce((total, group) => total + group.count, 0);
		const maxPoints = groups.reduce((total, group) => total + group.count * levelData.format.scoring?.pointsBySection?.[group.section], 0);
		if (!Number.isFinite(maxPoints) || !Number.isFinite(levelData.format.scoring?.passingScore) || levelData.format.scoring.passingScore <= 0 || levelData.format.scoring.passingScore > maxPoints) throw new Error("시험 배점 정보가 올바르지 않습니다");
		const minutes = Math.round(levelData.format.durationSeconds / 60);
		$("mockModeFullTitle").textContent = `${count}문제 실전`;
		$("mockModeFullDescription").textContent = `기출 순서 그대로, ${minutes}분 안에 풀어요. 결과는 제출 후 공개됩니다.`;
		$("mockSource").textContent = `출제 기준 · ${levelData.format.sourceLabel || levelData.source} · 어휘: 선택 한자 KRDict · ${groups.length}개 유형 / ${count}문항 / ${minutes}분 · 합격 ${levelData.format.scoring.passingScore}/${maxPoints}점`;
		const typeSelect = $("mockType");
		const selected = typeSelect.value;
		typeSelect.replaceChildren(new Option("전체 유형 · 시험지 순서", "all"), ...groups.map((group) =>
			new Option(`${rangeLabel(group)} · ${group.title}`, group.type)));
		if ([...typeSelect.options].some((option) => option.value === selected)) typeSelect.value = selected;
	}
	return levelData;
}

function chooseMode(value) {
	mode = value;
	for (const [id, choice] of [["mockModeSingle", "single"], ["mockModeFull", "full"]]) {
		$(id).classList.toggle("is-selected", choice === mode);
		$(id).setAttribute("aria-pressed", String(choice === mode));
	}
	$("mockTypeField").classList.toggle("is-hidden", mode === "full");
}

async function start() {
	const button = $("mockStart");
	button.disabled = true;
	button.classList.add("is-loading");
	$("mockSetupStatus").textContent = "문항을 준비하는 중…";
	try {
		const level = mockExamLevel($("mockLevel").value);
		if (!level) throw new Error("시험 급수를 선택하세요");
		const levelData = await prepareLevel();
		data = {...levelData, words: examWordsForLevel(await loadVocabularyCatalog(), levelData.characters)};
		if (data.level !== level.label || !data.characters?.length || !data.words?.length || !data.format.sections.length || !data.format.durationSeconds) throw new Error("시험 문항 자료를 확인할 수 없습니다");
		const trainingType = $("mockType").value;
		const trainingPosition = trainingType === "all" ? 0 : examGroups(data).find((group) => group.type === trainingType)?.startIndex;
		const questions = mode === "full" ? makeExam(data) : [newTrainingQuestion([], trainingType, trainingPosition)];
		session = {mode, level: data.level, scoring: data.format.scoring, questions, answers: Array(questions.length).fill(null), index: 0, trainingType, trainingPosition, startedAt: new Date(), finishedAt: null, elapsedSeconds: 0};
		$("mockSetup").classList.add("is-hidden");
		$("mockResult").classList.add("is-hidden");
		$("mockPlay").classList.remove("is-hidden");
		$("mockSetupStatus").textContent = "";
		clearInterval(clock);
		clock = setInterval(tick, 250);
		tick();
		renderQuestion();
	} catch (error) {
		$("mockSetupStatus").textContent = koreanError(error, "모의시험 자료를 불러올 수 없습니다");
	} finally {
		button.disabled = false;
		button.classList.remove("is-loading");
	}
}

function newTrainingQuestion(previous, selected, position) {
	const groups = examGroups(data);
	const type = selected === "all" ? groups.find((group) => group.startIndex <= position && position <= group.endIndex)?.type : selected;
	if (!groups.some((group) => group.type === type)) throw new Error("선택한 유형의 문항 자료가 없습니다");
	const excluded = new Set(previous.slice(-12).filter((entry) => entry.type === type).map((entry) => entry.source));
	return {...makeQuestion(data, type, secureRandom, excluded), number: previous.length + 1};
}

function tick() {
	if (!session || session.finishedAt) return;
	const elapsed = Math.floor((Date.now() - session.startedAt.getTime()) / 1000);
	const remaining = data.format.durationSeconds - elapsed;
	if (session.mode === "full" && remaining <= 0) {
		$("mockTimer").textContent = "00:00";
		finish();
		return;
	}
	$("mockTimer").textContent = formatDuration(session.mode === "full" ? remaining : elapsed);
	$("mockTimer").classList.toggle("is-danger", session.mode === "full" && remaining <= 300);
}

function renderQuestion() {
	if (!session || session.finishedAt) return;
	const {questions, answers, index} = session;
	const question = questions[index];
	const answer = answers[index];
	const full = session.mode === "full";
	const showTypeMap = full || session.trainingType === "all";
	const groups = examGroups(data);
	const position = full ? index : session.trainingPosition;
	const groupIndex = groups.findIndex((entry) => entry.startIndex <= position && position <= entry.endIndex);
	const group = groups[groupIndex];
	const totalAnswered = answers.filter((value) => value !== null).length;
	$("mockSessionLabel").textContent = full ? `${questions.length}문제 실전 · ${formatDuration(data.format.durationSeconds)}` : "한 문제씩 연습 · 바로 확인";
	$("mockProgress").textContent = full ? `답함 ${totalAnswered} / ${questions.length} · 현재 ${index + 1}번` : `${index + 1}번째 문제 · ${totalAnswered}문제 답함`;
	$("mockProgressBar").classList.toggle("is-hidden", !full);
	$("mockProgressBar").value = totalAnswered / questions.length * 100;
	$("mockMap").classList.toggle("is-hidden", !showTypeMap);
	$("mockTypeContext").classList.toggle("is-hidden", !showTypeMap);
	$("mockGroupTitle").textContent = `${String(groupIndex + 1).padStart(2, "0")} / ${String(groups.length).padStart(2, "0")} · ${group.title}`;
	const groupAnswered = full ? answers.slice(group.startIndex, group.endIndex + 1).filter((value) => value !== null).length : null;
	$("mockGroupProgress").textContent = full ? `${rangeLabel(group)} · ${index - group.startIndex + 1}/${group.count} 문항 · 답함 ${groupAnswered}/${group.count}` : `기출 ${rangeLabel(group)} 유형 · 문제별 정답 확인`;
	$("mockSectionBadge").textContent = `제${question.section === "한자" ? "1" : "2"}영역 · ${question.section}`;
	$("mockTypeBadge").textContent = question.title;
	$("mockInstruction").textContent = question.instruction;
	$("mockStimulus").textContent = question.stimulus;
	const choices = $("mockChoices");
	choices.replaceChildren(...question.choices.map((choice, choiceIndex) => {
		const button = document.createElement("button");
		button.type = "button";
		button.className = "button is-light mock-choice";
		button.setAttribute("aria-pressed", String(choice === answer));
		button.append(label(String(choiceIndex + 1), "mock-choice-number"), label(choice, "mock-choice-text"));
		if (choice === answer) button.classList.add("is-selected");
		if (!full && answer !== null) {
			button.disabled = true;
			if (choice === question.correct) button.classList.add("is-correct");
			else if (choice === answer) button.classList.add("is-wrong");
		}
		button.addEventListener("click", () => chooseAnswer(choice));
		return button;
	}));
	const feedback = $("mockFeedback");
	feedback.classList.toggle("is-hidden", full || answer === null);
	if (!full && answer !== null) {
		feedback.className = `notification is-light mock-feedback ${answer === question.correct ? "is-success" : "is-danger"}`;
		feedback.textContent = `${answer === question.correct ? "정답이에요!" : `아쉬워요. 정답은 ${question.correct}입니다.`} ${question.explanation}`;
	}
	$("mockPrevious").classList.toggle("is-hidden", !full || index === 0);
	$("mockNext").disabled = !full && answer === null;
	const nextGroup = groups[groupIndex + 1] || (!full ? groups[0] : null);
	const groupEnd = full ? index === group.endIndex : session.trainingPosition === group.endIndex && session.trainingType === "all";
	$("mockNext").textContent = full && index === questions.length - 1 ? "제출하고 채점 →" : groupEnd ? `다음 유형: ${nextGroup.title} →` : "다음 문제 →";
	$("mockMapLegend").classList.toggle("is-hidden", !full);
	$("mockFinish").querySelector(".mock-hold-label").textContent = full ? "지금 제출하고 채점" : "길게 눌러 연습 종료";
	$("mockFinish").classList.toggle("is-training", !full);
	$("mockFinish").classList.toggle("is-danger", !full);
	$("mockFinish").classList.toggle("is-light", full);
	if (showTypeMap) renderGroupNavigator(groups, groupIndex);
	const jump = $("mockJump");
	jump.classList.toggle("is-hidden", !full);
	if (full) jump.replaceChildren(...Array.from({length: group.count}, (_, offset) => {
		const number = group.startIndex + offset;
		const button = document.createElement("button");
		button.type = "button";
		button.className = "button is-small is-light mock-jump-button";
		button.classList.toggle("is-current", number === index);
		button.classList.toggle("is-answered", answers[number] !== null);
		button.textContent = String(number + 1);
		button.setAttribute("aria-label", `${number + 1}번 문항 · ${answers[number] !== null ? "답함" : "미응답"}`);
		if (number === index) button.setAttribute("aria-current", "step");
		button.addEventListener("click", () => {session.index = number; renderQuestion();});
		return button;
	}));
}

function renderGroupNavigator(groups, currentIndex) {
	const full = session.mode === "full";
	const navigator = $("mockGroupNav");
	navigator.replaceChildren();
	for (const [groupIndex, group] of groups.entries()) {
		const button = document.createElement("button");
		button.type = "button";
		button.className = "button is-light mock-group-button";
		button.classList.toggle("is-current", groupIndex === currentIndex);
		button.setAttribute("aria-current", groupIndex === currentIndex ? "step" : "false");
		const answered = full ? session.answers.slice(group.startIndex, group.endIndex + 1).filter((answer) => answer !== null).length : 0;
		button.classList.toggle("is-answered", answered > 0);
		button.classList.toggle("is-complete", full && answered === group.count);
		button.append(label(rangeLabel(group), "mock-group-range"), label(group.title, "mock-group-name"), label(full ? `${answered}/${group.count}` : `${group.count}문항`, "mock-group-count"));
		button.setAttribute("aria-label", `${group.section} ${rangeLabel(group)} ${group.title}${full ? `, ${answered}/${group.count} 답함` : ", 유형 연습하기"}`);
		button.addEventListener("click", () => jumpToGroup(group));
		navigator.appendChild(button);
	}
}

function jumpToGroup(group) {
	if (!session || session.finishedAt) return;
	if (session.mode === "full") {
		const firstUnanswered = session.answers.findIndex((answer, index) => index >= group.startIndex && index <= group.endIndex && answer === null);
		session.index = firstUnanswered < 0 ? group.startIndex : firstUnanswered;
	} else {
		session.trainingType = "all";
		session.trainingPosition = group.startIndex;
		session.questions.push(newTrainingQuestion(session.questions, "all", group.startIndex));
		session.answers.push(null);
		session.index++;
	}
	renderQuestion();
}

function label(text, className) {
	const element = document.createElement("span");
	element.className = className;
	element.textContent = text;
	return element;
}

function chooseAnswer(choice) {
	if (!session || session.finishedAt) return;
	if (session.mode === "full" && Date.now() - session.startedAt.getTime() >= data.format.durationSeconds * 1000) return finish();
	const index = session.index;
	if (!session.questions[index].choices.includes(choice)) return;
	if (session.mode === "single" && session.answers[index] !== null) return;
	session.answers[index] = choice;
	renderQuestion();
}

function move(direction) {
	if (!session || session.finishedAt) return;
	if (session.mode === "full") {
		if (direction < 0 && session.index > 0) session.index--;
		else if (direction > 0 && session.index < session.questions.length - 1) session.index++;
		else if (direction > 0 && session.index === session.questions.length - 1) return finish();
	} else if (direction > 0 && session.answers[session.index] !== null) {
		if (session.trainingType === "all") session.trainingPosition = (session.trainingPosition + 1) % examGroups(data).reduce((total, group) => total + group.count, 0);
		session.questions.push(newTrainingQuestion(session.questions, session.trainingType, session.trainingPosition));
		session.answers.push(null);
		session.index++;
	}
	renderQuestion();
}

function finish() {
	if (!session || session.finishedAt) return;
	cancelStopHold();
	session.finishedAt = new Date();
	session.elapsedSeconds = Math.floor((session.finishedAt - session.startedAt) / 1000);
	if (session.mode === "full") session.elapsedSeconds = Math.min(data.format.durationSeconds, session.elapsedSeconds);
	clearInterval(clock);
	$("mockPlay").classList.add("is-hidden");
	$("mockResult").classList.remove("is-hidden");
	renderResult();
}

function renderResult() {
	const score = scoreQuestions(session.questions, session.answers);
	const official = session.mode === "full" ? scoreExam(session.questions, session.answers, session.scoring) : null;
	const wrong = score.answered - score.correct;
	const unanswered = score.total - score.answered;
	const date = new Intl.DateTimeFormat("ko-KR", {dateStyle: "full", timeStyle: "short"}).format(session.finishedAt);
	$("mockResultMeta").textContent = `${date} · ${session.mode === "full" ? `${session.questions.length}문제 실전` : "한 문제씩 연습"} · ${formatDuration(session.elapsedSeconds)} 소요`;
	$("mockDownloadStatus").textContent = "브라우저에서 인쇄하여 PDF로도 저장할 수 있습니다";
	const percent = official?.percent ?? score.percent;
	$("mockPercent").textContent = `${percent}%`;
	const ring = $("mockScoreRing");
	ring.style.setProperty("--mock-score", `${percent}%`);
	ring.classList.toggle("is-pass", official?.passed === true);
	ring.classList.toggle("is-fail", official?.passed === false);
	const pass = $("mockPass");
	pass.classList.toggle("is-hidden", !official);
	if (official) {
		pass.className = `tag is-medium is-light ${official.passed ? "is-success" : "is-danger"}`;
		pass.textContent = `${official.passed ? "합격" : "불합격"} · 합격 기준 ${official.passingScore}/${official.maxPoints}점`;
	}
	const stats = official ? [[`${official.earnedPoints} / ${official.maxPoints}`, "시험 점수"], [`${score.correct} / ${score.total}`, "정답"], [String(wrong), "오답"], [String(unanswered), "미응답"]] : [[`${score.correct} / ${score.total}`, "정답"], [String(wrong), "오답"], [String(unanswered), "미응답"], [formatDuration(session.elapsedSeconds), "소요 시간"]];
	$("mockStats").replaceChildren(...stats.map(([value, caption]) => {
		const column = document.createElement("div");
		column.className = "column is-one-quarter-tablet is-half-mobile";
		const card = document.createElement("div");
		card.className = "box mock-stat";
		card.append(label(value, "mock-stat-value"), label(caption, "mock-stat-label"));
		column.appendChild(card);
		return column;
	}));
	$("mockWeakness").replaceChildren(...weaknessLines(session.questions, session.answers).map(([title, value]) => {
		const row = document.createElement("p");
		row.append(label(title, "mock-weakness-label"), label(value, "mock-weakness-value"));
		return row;
	}));
	$("mockReview").replaceChildren(...session.questions.map((question, index) => {
		const status = answerStatus(question, session.answers[index]);
		const card = document.createElement("article");
		card.className = `box mock-review-card is-${status}`;
		const head = document.createElement("div");
		head.className = "mock-review-head";
		head.append(label(`${index + 1}. ${question.section} · ${question.title}`, ""), label({correct: "정답", wrong: "오답", unanswered: "미응답"}[status], "mock-review-status"));
		card.append(head, label(`${question.instruction}  ${question.stimulus}`, "mock-review-prompt"));
		const choices = document.createElement("div");
		choices.className = "mock-review-choices";
		for (const choice of question.choices) {
			const item = label(choice, "tag is-light mock-review-choice");
			if (choice === question.correct) item.className = "tag is-success is-light mock-review-choice";
			if (choice === session.answers[index] && status === "wrong") item.className = "tag is-danger is-light mock-review-choice";
			choices.appendChild(item);
		}
		card.append(choices, label(`정답 ${question.correct} · ${question.explanation}`, "mock-review-explanation"));
		return card;
	}));
}

function downloadReport() {
	if (!session?.finishedAt) return;
	const html = buildReportHTML(session);
	const url = URL.createObjectURL(new Blob([html], {type: "text/html;charset=utf-8"}));
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = `상공회의소-${session.level}-${session.finishedAt.toLocaleDateString("sv-SE")}-연습리포트.html`;
	document.body.appendChild(anchor);
	anchor.click();
	anchor.remove();
	$("mockDownloadStatus").textContent = `${anchor.download} 파일을 내려받았습니다`;
	setTimeout(() => URL.revokeObjectURL(url), 30000);
}

function showSetup() {
	cancelRestartHold();
	session = null;
	clearInterval(clock);
	$("mockResult").classList.add("is-hidden");
	$("mockPlay").classList.add("is-hidden");
	$("mockSetup").classList.remove("is-hidden");
}
