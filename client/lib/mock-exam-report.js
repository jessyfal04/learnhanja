import { scoreExam, scoreQuestions } from "./mock-exam-data.js?v=5";

export function escapeHTML(value) {
	return String(value ?? "").replace(/[&<>"']/g, (character) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"})[character]);
}

export function answerStatus(question, answer) {
	if (answer === null || answer === undefined) return "unanswered";
	return answer === question.correct ? "correct" : "wrong";
}

export function formatDuration(seconds) {
	const value = Math.max(0, Math.floor(seconds));
	return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

export function reportFilename({level, mode, partial, questions, answers, scoring, finishedAt}, downloadNumber = 1) {
	const score = mode === "full" ? `${scoreExam(questions, answers, scoring).earnedPoints}점` : `${scoreQuestions(questions, answers).percent}퍼센트`;
	const date = finishedAt.toLocaleDateString("sv-SE");
	const time = [finishedAt.getHours(), finishedAt.getMinutes(), finishedAt.getSeconds()].map((value) => String(value).padStart(2, "0")).join("-") + `-${String(finishedAt.getMilliseconds()).padStart(3, "0")}`;
	return `상공회의소-${level}-${mode === "full" ? "실전모의시험" : "유형연습"}-${partial ? "독음부분" : "전체"}-${score}-${date}_${time}-${String(downloadNumber).padStart(2, "0")}.html`;
}

export function weaknessLines(questions, answers) {
	const misses = questions.flatMap((question, index) => answerStatus(question, answers[index]) === "correct" ? [] : [{question, answer: answers[index]}]);
	const characters = [...new Set(misses.filter(({question}) => question.section === "한자").map(({question}) => question.source))];
	const counts = new Map();
	for (const {question} of misses) counts.set(question.title, (counts.get(question.title) || 0) + 1);
	const categories = [...counts].sort((left, right) => right[1] - left[1]).map(([title, count]) => `${title} ${count}`);
	const readings = misses.filter(({question, answer}) => answer != null && ["characterSound", "soundCharacter", "wordSound", "soundWord", "sentenceSound"].includes(question.type))
		.map(({question, answer}) => `${question.stimulus}: ${answer} → ${question.correct}`);
	const list = (values, limit) => values.length ? `${values.slice(0, limit).join(" · ")}${values.length > limit ? ` · 외 ${values.length - limit}` : ""}` : "없음";
	return [
		["오답·미응답", `한자 ${misses.filter(({question}) => question.section === "한자").length} · 어휘 ${misses.filter(({question}) => question.section === "어휘").length}${questions.some((question) => question.section === "독해") ? ` · 독해 ${misses.filter(({question}) => question.section === "독해").length}` : ""}`],
		["다시 볼 한자", list(characters, 12)],
		["약한 유형", list(categories, 5)],
		["헷갈린 음", list(readings, 4)],
	];
}

export function buildReportHTML({questions, answers, mode, partial = false, level, scoring, startedAt, finishedAt, elapsedSeconds}) {
	const score = scoreQuestions(questions, answers);
	const official = mode === "full" && scoring ? scoreExam(questions, answers, scoring) : null;
	const date = new Intl.DateTimeFormat("ko-KR", {dateStyle: "full", timeStyle: "short"}).format(finishedAt);
	const rows = questions.map((question, index) => {
		const status = answerStatus(question, answers[index]);
		const statusLabel = {correct: "정답", wrong: "오답", unanswered: "미응답"}[status];
		const choices = question.choices.map((choice, choiceIndex) => {
			const classes = [choice === question.correct ? "is-answer" : "", choice === answers[index] && status === "wrong" ? "is-error" : ""].filter(Boolean).join(" ");
			return `<li class="${classes}"><span>${choiceIndex + 1}</span>${escapeHTML(choice)}${choice === question.correct ? " <b>정답</b>" : ""}${choice === answers[index] && status === "wrong" ? " <b>내 선택</b>" : ""}</li>`;
		}).join("");
		const stimulus = question.stimulusParts ? `${escapeHTML(question.stimulusParts[0])}<u>${escapeHTML(question.stimulusParts[1])}</u>${escapeHTML(question.stimulusParts[2])}` : escapeHTML(question.stimulus);
		return `<article class="question ${status}"><div class="question-head"><div><span class="number">${String(index + 1).padStart(2, "0")}</span><span class="type">${escapeHTML(question.section)} · ${escapeHTML(question.title)}</span></div><strong class="status">${statusLabel}</strong></div><p class="instruction">${escapeHTML(question.instruction)}</p><p class="stimulus${question.stimulusParts ? " is-sentence" : ""}">${stimulus}</p><ol>${choices}</ol><p class="explanation">풀이 · ${escapeHTML(question.explanation)}</p></article>`;
	}).join("");
	const wrong = score.answered - score.correct;
	const unanswered = score.total - score.answered;
	const scoreValue = official ? `${official.earnedPoints} / ${official.maxPoints}` : `${score.percent}%`;
	const scoreCaption = official ? `${partial ? "부분 연습" : "시험"} 점수 · ${official.percent}%` : "점수";
	const scoreClass = official ? official.passed ? "pass" : "fail" : "";
	const verdict = official ? `<p class="verdict ${official.passed ? "pass" : "fail"}">${partial ? official.passed ? "연습 통과" : "연습 미달" : official.passed ? "합격" : "불합격"} · ${partial ? "연습" : "합격"} 기준 ${official.passingScore}/${official.maxPoints}점</p>` : "";
	const weakness = weaknessLines(questions, answers).map(([label, value]) => `<p><strong>${escapeHTML(label)}</strong><span>${escapeHTML(value)}</span></p>`).join("");
	return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>상공회의소 ${escapeHTML(level)} 연습 리포트</title><style>
*{box-sizing:border-box}body{margin:0;background:#f5f8fd;color:#162439;font-family:system-ui,"Noto Sans KR",sans-serif;line-height:1.55}.page{max-width:900px;margin:0 auto;padding:44px 24px 80px}.hero{background:linear-gradient(120deg,#e6f2ff,#f6eeff);border:1px solid #d8e7fa;border-radius:26px;padding:34px 38px}.eyebrow{font-size:12px;letter-spacing:.13em;font-weight:800;color:#3866a4}.hero h1{font-size:32px;margin:8px 0}.meta{color:#50647e;margin:0}.verdict{display:inline-block;margin:14px 0 0;border-radius:100px;padding:5px 12px;font-size:13px;font-weight:800}.verdict.pass{background:#e5f7f0;color:#087653}.verdict.fail{background:#fff0f0;color:#ad3543}.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:22px 0 32px}.stat{background:#fff;border:1px solid #e0e8f2;border-radius:16px;padding:18px}.stat.pass{background:#f3fcf7;border-color:#a8dfc6;color:#087653}.stat.fail{background:#fff7f7;border-color:#efb2ba;color:#ad3543}.stat strong{display:block;font-size:26px}.stat span{color:#60748d;font-size:13px}.weakness{background:#fff;border:1px solid #e0e8f2;border-radius:16px;padding:18px 22px}.weakness h2{font-size:18px;margin:0 0 8px}.weakness p{display:flex;gap:16px;margin:5px 0;font-size:13px}.weakness strong{flex:0 0 100px;color:#365577}.weakness span{overflow-wrap:anywhere}.section-title{margin:34px 0 16px;font-size:21px}.question{background:#fff;border:1px solid #e1e9f4;border-left:6px solid #a5b4c8;border-radius:17px;padding:22px;margin:14px 0;break-inside:avoid}.question.correct{border-left-color:#16a078}.question.wrong{border-left-color:#e56b77}.question.unanswered{border-left-color:#d5a43d}.question-head{display:flex;justify-content:space-between;align-items:center;gap:12px}.number{font-weight:900;color:#3467b5;margin-right:12px}.type{color:#5b6e86;font-size:13px}.status{border-radius:100px;padding:5px 12px;font-size:12px;background:#eff3f8}.correct .status{background:#e5f7f0;color:#087653}.wrong .status{background:#fff0f0;color:#ad3543}.unanswered .status{background:#fff6de;color:#886414}.instruction{font-weight:700;margin:18px 0 5px}.stimulus.is-sentence{font-size:19px;font-weight:600;line-height:1.7;white-space:pre-line}.stimulus{font-size:30px;font-weight:750;margin:4px 0 18px;font-family:"Noto Serif CJK KR",serif}ol{list-style:none;padding:0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}li{border:1px solid #e1e9f3;border-radius:10px;padding:9px 12px}li span{color:#6d80a1;margin-right:9px;font-weight:800}li.is-answer{background:#e8f8f0;border-color:#6ed0a4;color:#086b4e}li.is-error{background:#fff0f0;border-color:#f19aa1;color:#9c2b3a}li b{font-size:11px;margin-left:6px}.explanation{background:#f6f9fd;border-radius:9px;padding:10px 13px;margin:14px 0 0;color:#546982;font-size:13px}.foot{color:#7789a0;font-size:12px;margin-top:34px}@media(max-width:620px){.summary{grid-template-columns:repeat(2,1fr)}ol{grid-template-columns:1fr}.page{padding:20px 14px}.hero{padding:24px}}@media print{body{background:#fff}.page{padding:0}.hero,.stat,.question{-webkit-print-color-adjust:exact;print-color-adjust:exact}.question{page-break-inside:avoid}}
</style></head><body><main class="page"><header class="hero"><div class="eyebrow">LEARNHANJA · PRACTICE REPORT</div><h1>상공회의소 ${escapeHTML(level)} ${partial ? "독음 부분 연습 · " : ""}${mode === "full" ? "실전 모의시험" : "한 문제씩 연습"}</h1><p class="meta">${escapeHTML(date)} · 소요 ${formatDuration(elapsedSeconds)} · ${score.total}문항</p>${verdict}</header><section class="summary"><div class="stat ${scoreClass}"><strong>${scoreValue}</strong><span>${scoreCaption}</span></div><div class="stat"><strong>${score.correct}</strong><span>정답</span></div><div class="stat"><strong>${wrong}</strong><span>오답</span></div><div class="stat"><strong>${unanswered}</strong><span>미응답</span></div></section><section class="weakness"><h2>약점 요약</h2>${weakness}</section><h2 class="section-title">문항별 결과</h2>${rows}<p class="foot">시작: ${escapeHTML(new Intl.DateTimeFormat("ko-KR", {dateStyle: "full", timeStyle: "short"}).format(startedAt))} · 문제는 ${escapeHTML(level)} 자료에서 매번 새로 생성됩니다.</p></main></body></html>`;
}
