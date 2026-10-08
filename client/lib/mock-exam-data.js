import { searchVocabulary } from "./vocabulary-data.js?v=3";

export const examSections = [
	{type: "strokes", title: "획수", section: "한자", count: 1, instruction: "다음 한자의 획수는 모두 몇 획입니까?"},
	{type: "radical", title: "부수", section: "한자", count: 1, instruction: "다음 한자의 부수는 무엇입니까?"},
	{type: "characterSound", title: "한자의 음", section: "한자", count: 5, instruction: "다음 한자의 음은 무엇입니까?"},
	{type: "soundCharacter", title: "음에서 한자", section: "한자", count: 5, instruction: "다음 음을 가진 한자는 무엇입니까?"},
	{type: "characterMeaning", title: "한자의 뜻", section: "한자", count: 4, instruction: "다음 한자의 뜻은 무엇입니까?"},
	{type: "meaningCharacter", title: "뜻에서 한자", section: "한자", count: 4, instruction: "다음 뜻을 가진 한자는 무엇입니까?"},
	{type: "wordSound", title: "한자어의 음", section: "어휘", count: 4, instruction: "다음 한자어의 음은 무엇입니까?"},
	{type: "soundWord", title: "음에서 한자어", section: "어휘", count: 2, instruction: "다음 음을 가진 한자어는 무엇입니까?"},
	{type: "wordMeaning", title: "한자어의 뜻", section: "어휘", count: 2, instruction: "다음 한자어의 뜻은 무엇입니까?"},
	{type: "meaningWord", title: "뜻에서 한자어", section: "어휘", count: 2, instruction: "다음 뜻에 해당하는 한자어는 무엇입니까?"},
];

export function examGroups(data) {
	let startIndex = 0;
	return data.format.sections.map(({type, count}) => {
		const section = examSections.find((entry) => entry.type === type);
		if (!section || !Number.isInteger(count) || count < 1) throw new Error("시험 유형 구성이 올바르지 않습니다");
		const group = {...section, count, startIndex, endIndex: startIndex + count - 1};
		startIndex += count;
		return group;
	});
}

export function examWordsForLevel(catalog, characters) {
	const selected = searchVocabulary(catalog, characters.map((entry) => entry.hanja), Infinity).entries;
	const eligible = selected.filter((entry) => [...entry.hanja].length > 1 && entry.hangul && entry.definitions?.some((definition) => definition.trim()));
	const spellings = new Map();
	for (const entry of eligible) spellings.set(entry.hanja, (spellings.get(entry.hanja) || 0) + 1);
	return eligible.filter((entry) => spellings.get(entry.hanja) === 1).map((entry) => ({
		hanja: entry.hanja,
		reading: entry.hangul,
		meaning: entry.definitions.find((definition) => definition.trim()).trim().replace(/[.!?]$/u, ""),
	}));
}

export function secureRandom() {
	const value = new Uint32Array(1);
	globalThis.crypto.getRandomValues(value);
	return value[0] / 0x100000000;
}

export function shuffle(values, random = secureRandom) {
	const result = [...values];
	for (let i = result.length - 1; i > 0; i--) {
		const j = Math.floor(random() * (i + 1));
		[result[i], result[j]] = [result[j], result[i]];
	}
	return result;
}

function uniqueValues(entries, field) {
	return [...new Set(entries.map((entry) => String(entry[field])))];
}

function fiveChoices(correct, values, random) {
	const others = shuffle(values.filter((value) => value !== correct), random).slice(0, 4);
	if (others.length !== 4) throw new Error("문항 선택지가 부족합니다");
	return shuffle([correct, ...others], random);
}

export function makeQuestion(data, type, random = secureRandom, excluded = new Set(), targetSource = null) {
	const section = examSections.find((entry) => entry.type === type);
	if (!section) throw new Error(`알 수 없는 문항 유형: ${type}`);
	const entries = type.startsWith("word") || type.endsWith("Word") ? data.words : data.characters;
	const available = entries.filter((entry) => !excluded.has(entry.hanja) && (targetSource === null || entry.hanja === targetSource));
	if (!available.length) throw new Error(`문항 자료가 부족합니다: ${type}`);
	const target = shuffle(available, random)[0];
	let stimulus;
	let correct;
	let values;
	switch (type) {
		case "strokes": {
			stimulus = target.hanja;
			correct = String(target.strokes);
			const start = Math.max(1, target.strokes - 2);
			values = Array.from({length: 5}, (_, index) => String(start + index));
			break;
		}
		case "radical": stimulus = target.hanja; correct = target.radical; values = uniqueValues(entries, "radical"); break;
		case "characterSound": stimulus = target.hanja; correct = target.sound; values = uniqueValues(entries, "sound"); break;
		case "soundCharacter": stimulus = target.sound; correct = target.hanja; values = entries.filter((entry) => entry.sound !== target.sound).map((entry) => entry.hanja); break;
		case "characterMeaning": stimulus = target.hanja; correct = target.meaning; values = uniqueValues(entries, "meaning"); break;
		case "meaningCharacter": stimulus = target.meaning; correct = target.hanja; values = entries.filter((entry) => entry.meaning !== target.meaning).map((entry) => entry.hanja); break;
		case "wordSound": stimulus = target.hanja; correct = target.reading; values = uniqueValues(entries, "reading"); break;
		case "soundWord": stimulus = target.reading; correct = target.hanja; values = entries.filter((entry) => entry.reading !== target.reading).map((entry) => entry.hanja); break;
		case "wordMeaning": stimulus = target.hanja; correct = target.meaning; values = uniqueValues(entries, "meaning"); break;
		case "meaningWord": stimulus = target.meaning; correct = target.hanja; values = entries.filter((entry) => entry.meaning !== target.meaning).map((entry) => entry.hanja); break;
	}
	const choices = type === "strokes" ? shuffle(values, random) : fiveChoices(correct, values, random);
	return {
		type, title: section.title, section: section.section, instruction: section.instruction,
		stimulus, choices, correct, source: target.hanja,
		explanation: "reading" in target ? `${target.hanja} · ${target.reading} · ${target.meaning}` : `${target.hanja} · ${target.sound} · ${target.meaning} · ${target.strokes}획 · 부수 ${target.radical}`,
	};
}

export function makeExam(data, random = secureRandom) {
	const questions = [];
	for (const section of examGroups(data)) {
		const used = new Set();
		for (let index = 0; index < section.count; index++) {
			const question = makeQuestion(data, section.type, random, used);
			used.add(question.source);
			questions.push({...question, number: questions.length + 1});
		}
	}
	return questions;
}

export function scoreQuestions(questions, answers) {
	const correct = questions.reduce((total, question, index) => total + (answers[index] === question.correct ? 1 : 0), 0);
	return {correct, total: questions.length, answered: answers.filter((answer) => answer !== null && answer !== undefined).length, percent: questions.length ? Math.round(correct / questions.length * 100) : 0};
}

export function scoreExam(questions, answers, scoring) {
	const points = questions.map((question) => scoring?.pointsBySection?.[question.section]);
	const maxPoints = points.reduce((total, value) => total + value, 0);
	if (!Number.isFinite(scoring?.passingScore) || scoring.passingScore <= 0 || scoring.passingScore > maxPoints || points.some((value) => !Number.isFinite(value) || value <= 0)) throw new Error("시험 배점 정보가 올바르지 않습니다");
	const earnedPoints = points.reduce((total, value, index) => total + (answers[index] === questions[index].correct ? value : 0), 0);
	return {earnedPoints, maxPoints, passingScore: scoring.passingScore, passed: earnedPoints >= scoring.passingScore, percent: maxPoints ? Math.round(earnedPoints / maxPoints * 100) : 0};
}
