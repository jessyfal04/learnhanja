import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { examGroups, examSections, examWordsForLevel, makeExam, makeExamAsync, makeQuestion, makeQuestionAsync, partialExamData, scoreExam, scoreQuestions } from "./mock-exam-data.js";
import { answerStatus, buildReportHTML, reportFilename, weaknessLines } from "./mock-exam-report.js";
import { expandCatalog } from "./vocabulary-data.js";

const levelData = JSON.parse(readFileSync(new URL("../data/mock-exam.json", import.meta.url)))["9"];
const catalog = expandCatalog(JSON.parse(readFileSync(new URL("../data/vocabulary.json", import.meta.url))));
const data = {...levelData, words: examWordsForLevel(catalog, levelData.characters)};
const levelEight = JSON.parse(readFileSync(new URL("../data/mock-exam.json", import.meta.url)))["8"];
const eightWords = examWordsForLevel(catalog, levelEight.characters);
const eightSentenceWords = eightWords.filter((entry) => [...entry.hanja].length === 2 && [...entry.reading].length === 2 && /^[가-힣]+$/u.test(entry.reading));
const eight = {...levelEight, words: eightWords, sentenceWordsByType: {sentenceSound: eightSentenceWords, sentenceMeaning: eightSentenceWords}};
const levels = JSON.parse(readFileSync(new URL("../data/levels-sangong.json", import.meta.url)));
// 대한상공회의소 배정한자 (1~9급).zip / 배정한자 (5~9급).hwp의 9급 열
const officialNine = "車高工果交口女大力老立馬萬面母木目文門夫父山夕石手水身心兒羊魚玉王牛雨月衣人日子自長田足主天川土行火";

function randomSequence(seed) {
	let value = seed;
	return () => ((value = (value * 1664525 + 1013904223) >>> 0) / 0x100000000);
}

test("9급 bank uses only the tagged characters and complete source fields", () => {
	assert.deepEqual(new Set(data.characters.map((entry) => entry.hanja)), new Set(levels.groups[0].characters));
	assert.equal(data.characters.length, 50);
	assert.deepEqual(new Set(data.characters.map((entry) => entry.hanja.normalize("NFKC"))), new Set([...officialNine].map((character) => character.normalize("NFKC"))));
	assert.equal(Object.hasOwn(levelData, "words"), false);
	assert.equal(data.words.length, 91);
	const characters = new Set(levels.groups[0].characters);
	const dictionary = new Map(catalog.map((entry) => [entry.hanja, entry]));
	for (const entry of data.characters) {
		assert.ok(entry.sound && entry.meaning && entry.radical && entry.strokes > 0);
	}
	for (const entry of data.words) {
		assert.ok([...entry.hanja].every((character) => characters.has(character)));
		assert.equal(entry.reading, dictionary.get(entry.hanja).hangul);
		assert.equal(entry.meaning, dictionary.get(entry.hanja).definitions[0].replace(/[.!?]$/u, ""));
	}
});

test("each generated paper follows all 30 positions and has one valid answer per five choices", () => {
	const order = examGroups(data).flatMap((section) => Array(section.count).fill(section.type));
	assert.equal(order.length, 30);
	const first = makeExam(data, randomSequence(11));
	const second = makeExam(data, randomSequence(12));
	assert.deepEqual(first.map((question) => question.type), order);
	assert.notDeepEqual(first.map((question) => [question.source, question.choices]), second.map((question) => [question.source, question.choices]));
	for (const paper of [first, second]) for (const question of paper) {
		assert.equal(question.choices.length, 5);
		assert.equal(new Set(question.choices).size, 5);
		assert.equal(question.choices.filter((choice) => choice === question.correct).length, 1);
	}
	for (const section of examGroups(data)) {
		const sectionQuestions = first.filter((question) => question.type === section.type);
		assert.equal(new Set(sectionQuestions.map((question) => question.source)).size, section.count);
	}
});

test("paper-like traps use varied stroke positions and related choices", () => {
	const strokePositions = new Set();
	for (let seed = 1; seed <= 20; seed++) {
		const question = makeQuestion(data, "strokes", randomSequence(seed), new Set(), "羊");
		strokePositions.add(question.choices.indexOf(question.correct));
		assert.deepEqual([...question.choices].map(Number).sort((a, b) => a - b), Array.from({length: 5}, (_, index) => Math.min(...question.choices.map(Number)) + index));
	}
	assert.ok(strokePositions.size >= 3);
	const radical = makeQuestion(data, "radical", randomSequence(7), new Set(), "兒");
	assert.equal(radical.correct, "儿");
	assert.ok(radical.choices.includes("臼"));
	assert.ok(radical.choices.includes("兒"));
	const animal = makeQuestion(data, "characterMeaning", randomSequence(9), new Set(), "馬");
	assert.ok(animal.choices.includes("소"));
	assert.ok(animal.choices.includes("물고기"));
});

test("question type map follows the paper ranges and adapts to another level layout", () => {
	const groups = examGroups(data);
	assert.deepEqual(groups.map(({startIndex, endIndex}) => [startIndex + 1, endIndex + 1]), [[1, 1], [2, 2], [3, 7], [8, 12], [13, 16], [17, 20], [21, 24], [25, 26], [27, 28], [29, 30]]);
	assert.deepEqual(groups.map((group) => group.section), ["한자", "한자", "한자", "한자", "한자", "한자", "어휘", "어휘", "어휘", "어휘"]);
	assert.deepEqual(examGroups({format: {sections: [{type: "radical", count: 3}, {type: "wordSound", count: 6}]}}).map(({startIndex, endIndex}) => [startIndex, endIndex]), [[0, 2], [3, 8]]);
	assert.throws(() => examGroups({format: {sections: [{type: "unknown", count: 1}]}}), /시험 유형/);
});

test("every 9급 character and word can generate each relevant type with one valid choice", () => {
	const characterTypes = examSections.filter((section) => section.section === "한자").map((section) => section.type);
	const wordTypes = examSections.filter((section) => section.section === "어휘").map((section) => section.type);
	let checked = 0;
	for (const [entries, types] of [[data.characters, characterTypes], [data.words, wordTypes]]) for (const entry of entries) for (const type of types) {
		const question = makeQuestion(data, type, randomSequence(checked + 1), new Set(), entry.hanja);
		assert.equal(question.source, entry.hanja, `${type} ${entry.hanja}`);
		assert.equal(question.choices.length, 5, `${type} ${entry.hanja}`);
		assert.equal(new Set(question.choices).size, 5, `${type} ${entry.hanja}`);
		let valid;
		switch (type) {
			case "strokes": valid = [String(entry.strokes)]; break;
			case "radical": valid = [entry.radical]; break;
			case "characterSound": valid = [entry.sound]; break;
			case "characterMeaning": valid = [entry.meaning]; break;
			case "wordSound": valid = [entry.reading]; break;
			case "wordMeaning": valid = [entry.meaning]; break;
			case "soundCharacter": valid = data.characters.filter((other) => other.sound === question.stimulus).map((other) => other.hanja); break;
			case "meaningCharacter": valid = data.characters.filter((other) => other.meaning === question.stimulus).map((other) => other.hanja); break;
			case "soundWord": valid = data.words.filter((other) => other.reading === question.stimulus).map((other) => other.hanja); break;
			case "meaningWord": valid = data.words.filter((other) => other.meaning === question.stimulus).map((other) => other.hanja); break;
		}
		assert.deepEqual(question.choices.filter((choice) => valid.includes(choice)), [question.correct], `${type} ${entry.hanja}`);
		checked++;
	}
	assert.equal(checked, 50 * 6 + data.words.length * 4);
});

test("shared readings and meanings cannot become a second correct option", () => {
	for (const [first, second] of [["夕", "石"], ["天", "川"], ["夫", "父"], ["子", "自"], ["手", "水"], ["文", "門"], ["木", "目"], ["牛", "雨"]]) {
		for (const [target, other] of [[first, second], [second, first]]) {
			const question = makeQuestion(data, "soundCharacter", randomSequence(3), new Set(), target);
			assert.ok(!question.choices.includes(other), `${target} ${other}`);
		}
	}
	for (const [target, other] of [["石工", "石手"], ["石手", "石工"]]) {
		const question = makeQuestion(data, "meaningWord", randomSequence(3), new Set(), target);
		assert.ok(!question.choices.includes(other), `${target} ${other}`);
	}
});

test("9급 passing grade uses 4-point character and 6-point vocabulary questions", () => {
	const questions = makeExam(data, randomSequence(9));
	const answers = Array(questions.length).fill(null);
	for (let index = 0; index < 20; index++) answers[index] = questions[index].correct;
	assert.deepEqual(scoreExam(questions, answers, data.format.scoring), {earnedPoints: 80, maxPoints: 140, passingScore: 84, passed: false, percent: 57});
	const failReport = buildReportHTML({questions, answers, scoring: data.format.scoring, mode: "full", level: "9급", startedAt: new Date("2026-10-09T00:00:00Z"), finishedAt: new Date("2026-10-09T00:05:00Z"), elapsedSeconds: 300});
	assert.match(failReport, /<div class="stat fail">/);
	answers[20] = questions[20].correct;
	assert.deepEqual(scoreExam(questions, answers, data.format.scoring), {earnedPoints: 86, maxPoints: 140, passingScore: 84, passed: true, percent: 61});
	answers[18] = null;
	answers[19] = null;
	answers[21] = questions[21].correct;
	assert.equal(scoreExam(questions, answers, data.format.scoring).earnedPoints, 84);
	assert.equal(scoreExam(questions, answers, data.format.scoring).passed, true);
	const report = buildReportHTML({questions, answers, scoring: data.format.scoring, mode: "full", level: "9급", startedAt: new Date("2026-10-09T00:00:00Z"), finishedAt: new Date("2026-10-09T00:05:00Z"), elapsedSeconds: 300});
	assert.match(report, /합격 · 합격 기준 84\/140점/);
	assert.match(report, /84 \/ 140/);
	assert.match(report, /<div class="stat pass">/);
});

test("partial paper uses active known 독음 targets, scales sections and preserves five choices", () => {
	const known = data.characters.slice(0, 3);
	const statuses = {characters: Object.fromEntries(known.map((entry) => [entry.hanja.normalize("NFKC"), {status: "known", suspended: false}]))};
	statuses.characters[known[0].hanja] = {status: "known", suspended: true};
	const partial = partialExamData(data, statuses);
	const targetCharacters = new Set(known.slice(1).map((entry) => entry.hanja));
	assert.deepEqual(new Set(partial.targets.characters.map((entry) => entry.hanja)), targetCharacters);
	assert.ok(partial.targets.words.every((entry) => [...entry.hanja].every((character) => targetCharacters.has(character))));
	assert.ok(partial.format.sections.every((section) => section.count <= data.format.sections.find((full) => full.type === section.type).count));
	assert.ok(partial.format.durationSeconds < data.format.durationSeconds);
	const paper = makeExam(partial, randomSequence(33));
	assert.equal(paper.length, partial.format.sections.reduce((sum, section) => sum + section.count, 0));
	for (const question of paper) {
		assert.ok((question.section === "한자" ? targetCharacters : new Set(partial.targets.words.map((entry) => entry.hanja))).has(question.source));
		assert.equal(question.choices.length, 5);
		assert.equal(new Set(question.choices).size, 5);
	}
	const maxPoints = paper.reduce((sum, question) => sum + partial.format.scoring.pointsBySection[question.section], 0);
	assert.equal(partial.format.scoring.passingScore, Math.ceil(84 / 140 * maxPoints));
	const report = buildReportHTML({questions: paper, answers: paper.map((question) => question.correct), scoring: partial.format.scoring, mode: "full", partial: true, level: "9급", startedAt: new Date("2026-10-09T00:00:00Z"), finishedAt: new Date("2026-10-09T00:05:00Z"), elapsedSeconds: 300});
	assert.match(report, /독음 부분 연습/);
	assert.match(report, /연습 통과 · 연습 기준/);
});

test("single-question partial practice reuses a small known pool instead of stopping", () => {
	const target = data.characters[0];
	const partial = partialExamData(data, {characters: {[target.hanja]: {status: "known", suspended: false}}});
	assert.equal(partial.targets.characters.length, 1);
	assert.equal(partial.targets.words.length, 0);
	assert.equal(partial.format.sections.length, 6);
	assert.equal(partial.format.durationSeconds, 360);
	const first = makeQuestion(partial, "characterSound", randomSequence(1));
	const again = makeQuestion(partial, "characterSound", randomSequence(2), new Set([target.hanja]));
	assert.equal(first.source, target.hanja);
	assert.equal(again.source, target.hanja);
	assert.equal(again.choices.length, 5);
});

test("report filenames include scope, score, exact time and repeat count", () => {
	const questions = makeExam(data, randomSequence(7));
	const session = {level: "9급", mode: "full", partial: false, questions, answers: questions.map((question) => question.correct), scoring: data.format.scoring, finishedAt: new Date(2026, 9, 9, 5, 1, 7, 123)};
	assert.equal(reportFilename(session), "상공회의소-9급-실전모의시험-전체-140점-2026-10-09_05-01-07-123-01.html");
	assert.equal(reportFilename(session, 2), "상공회의소-9급-실전모의시험-전체-140점-2026-10-09_05-01-07-123-02.html");
	assert.match(reportFilename({...session, mode: "single", partial: true}), /유형연습-독음부분-100퍼센트/);
});

test("score and downloadable report distinguish correct, wrong and unanswered questions", () => {
	const questions = makeExam(data, randomSequence(5)).slice(0, 3);
	const answers = [questions[0].correct, questions[1].choices.find((choice) => choice !== questions[1].correct), null];
	assert.deepEqual(scoreQuestions(questions, answers), {correct: 1, total: 3, answered: 2, percent: 33});
	assert.deepEqual(questions.map((question, index) => answerStatus(question, answers[index])), ["correct", "wrong", "unanswered"]);
	const report = buildReportHTML({questions, answers, mode: "full", level: "9급", startedAt: new Date("2026-10-09T00:00:00Z"), finishedAt: new Date("2026-10-09T00:01:05Z"), elapsedSeconds: 65});
	assert.match(report, /33%/);
	assert.match(report, /01:05/);
	assert.match(report, /is-answer/);
	assert.match(report, /is-error/);
	assert.match(report, /미응답/);
});

test("each report gives a compact weakness summary by source, type and confused reading", () => {
	const questions = [
		{section: "한자", type: "characterSound", title: "한자의 음", source: "山", stimulus: "山", correct: "산"},
		{section: "어휘", type: "wordMeaning", title: "단어의 뜻", source: "山水", stimulus: "山水", correct: "산과 물"},
		{section: "어휘", type: "wordSound", title: "단어의 음", source: "山水", stimulus: "山水", correct: "산수"},
		{section: "한자", type: "strokes", title: "획수", source: "川", stimulus: "川", correct: "3"},
	];
	const answers = ["천", "산수화", "산소", null];
	assert.deepEqual(weaknessLines(questions, answers), [
		["오답·미응답", "한자 2 · 어휘 2"],
		["다시 볼 한자", "山 · 川"],
		["약한 유형", "한자의 음 1 · 단어의 뜻 1 · 단어의 음 1 · 획수 1"],
		["헷갈린 음", "山: 천 → 산 · 山水: 산소 → 산수"],
	]);
	const sample = makeExam(data, randomSequence(5)).slice(0, 3);
	const report = buildReportHTML({questions: sample, answers: [null, null, null], mode: "single", level: "9급", startedAt: new Date("2026-10-09T00:00:00Z"), finishedAt: new Date("2026-10-09T00:01:05Z"), elapsedSeconds: 65});
	assert.match(report, /<section class="weakness"><h2>약점 요약<\/h2>/);
	assert.match(report, /다시 볼 한자/);
	assert.match(report, /오답·미응답/);
});

test("8급 uses all twelve types, GPT reading contexts and 150/250 passing", async () => {
	assert.equal(eight.characters.length, 150);
	assert.deepEqual(new Set(eight.characters.map((entry) => entry.hanja)), new Set([...levels.groups[0].characters, ...levels.groups[1].characters]));
	assert.equal(eight.words.length, 680);
	assert.equal(eight.sentenceWordsByType.sentenceSound.length, 680);
	assert.deepEqual(examGroups(eight).map((group) => group.count), [2, 2, 7, 7, 6, 6, 6, 3, 3, 3, 3, 2]);
	const queried = [];
	const provider = async (hanja) => { queried.push(hanja); return {hanja, source: "ChatGPT", sentence: `오늘은 ${hanja}를 자세히 살펴보았다.`}; };
	const paper = await makeExamAsync(eight, provider, randomSequence(73));
	assert.equal(paper.length, 50);
	assert.equal(queried.length, 5);
	assert.deepEqual(paper.slice(-5).map((question) => question.section), Array(5).fill("독해"));
	for (const question of paper) {
		assert.equal(question.choices.length, 5);
		assert.equal(new Set(question.choices).size, 5);
		assert.equal(question.choices.filter((choice) => choice === question.correct).length, 1);
		if (question.section === "독해") assert.equal(question.stimulusParts[1], question.source);
	}
	const answers = paper.map((question, index) => index < 30 ? question.correct : null);
	assert.deepEqual(scoreExam(paper, answers, eight.format.scoring), {earnedPoints: 120, maxPoints: 250, passingScore: 150, passed: false, percent: 48});
	const report = buildReportHTML({questions: paper, answers, mode: "full", level: "8급", scoring: eight.format.scoring, startedAt: new Date(0), finishedAt: new Date(1000), elapsedSeconds: 1});
	assert.match(report, /<u>[^<]+<\/u>/);
	assert.match(report, /독해 5/);
});

test("8급 partial reading targets require known characters", async () => {
	const known = {characters: {人: {status: "known", suspended: false}, 口: {status: "known", suspended: false}}};
	const partial = partialExamData(eight, known);
	assert.ok(partial.targets.sentenceWordsByType.sentenceSound.length > 0);
	assert.ok(partial.targets.sentenceWordsByType.sentenceSound.every((word) => [...word.hanja].every((character) => ["人", "口"].includes(character))));
	const question = await makeQuestionAsync(partial, "sentenceSound", async (hanja) => ({hanja, source: "ChatGPT", sentence: `오늘은 ${hanja}를 살펴보았다.`}), randomSequence(5));
	assert.ok(partial.targets.sentenceWordsByType.sentenceSound.some((word) => word.hanja === question.source));
	assert.equal(question.choices.length, 5);
});
