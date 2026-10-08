import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { examGroups, examSections, examWordsForLevel, makeExam, makeQuestion, scoreExam, scoreQuestions } from "./mock-exam-data.js";
import { answerStatus, buildReportHTML, weaknessLines } from "./mock-exam-report.js";
import { expandCatalog } from "./vocabulary-data.js";

const levelData = JSON.parse(readFileSync(new URL("../data/mock-exam.json", import.meta.url)))["9"];
const catalog = expandCatalog(JSON.parse(readFileSync(new URL("../data/vocabulary.json", import.meta.url))));
const data = {...levelData, words: examWordsForLevel(catalog, levelData.characters)};
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
	assert.equal(data.words.length, 95);
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
	const order = examSections.flatMap((section) => Array(section.count).fill(section.type));
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
	for (const section of examSections) {
		const sectionQuestions = first.filter((question) => question.type === section.type);
		assert.equal(new Set(sectionQuestions.map((question) => question.source)).size, section.count);
	}
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
