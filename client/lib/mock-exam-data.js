import { searchVocabulary } from "./vocabulary-data.js?v=3";
import { examChoices } from "./mock-exam-traps.js?v=1";
import { isActiveStudyStatus } from "./study-status.js?v=2";

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
	{type: "sentenceSound", title: "문장 속 한자어의 음", section: "독해", count: 3, answerField: "reading", instruction: "밑줄 친 한자어의 음은 무엇입니까?"},
	{type: "sentenceMeaning", title: "문장 속 한자어의 뜻", section: "독해", count: 2, answerField: "meaning", instruction: "밑줄 친 한자어의 뜻은 무엇입니까?"},
];

export function examGroups(data) {
	let startIndex = 0;
	return data.format.sections.map(({type, count, ...options}) => {
		const section = examSections.find((entry) => entry.type === type);
		if (!section || !Number.isInteger(count) || count < 1) throw new Error("시험 유형 구성이 올바르지 않습니다");
		const group = {...section, ...options, count, startIndex, endIndex: startIndex + count - 1};
		startIndex += count;
		return group;
	});
}

export function examWordsForLevel(catalog, characters) {
	const selected = searchVocabulary(catalog, characters.map((entry) => entry.hanja), Infinity).entries;
	const eligible = selected.filter((entry) => [...entry.hanja].length === 2 && [...entry.hangul].length === 2 && /^[가-힣]{2}$/u.test(entry.hangul) && entry.definitions?.some((definition) => definition.trim()));
	const spellings = new Map();
	for (const entry of eligible) spellings.set(entry.hanja, (spellings.get(entry.hanja) || 0) + 1);
	return eligible.filter((entry) => spellings.get(entry.hanja) === 1).map((entry) => ({
		hanja: entry.hanja,
		reading: entry.hangul,
		meaning: entry.definitions.find((definition) => definition.trim()).trim().replace(/[.!?]$/u, ""),
	}));
}

export function partialExamData(data, ankiStatus) {
	const characters = data.characters.filter((entry) => isActiveStudyStatus(ankiStatus?.characters?.[entry.hanja.normalize("NFKC")], "known"));
	const known = new Set(characters.map((entry) => entry.hanja.normalize("NFKC")));
	const words = data.words.filter((entry) => [...entry.hanja].every((character) => known.has(character.normalize("NFKC"))));
	const sentenceWordsByType = Object.fromEntries(Object.entries(data.sentenceWordsByType || {}).map(([type, entries]) => [
		type,
		entries.filter((entry) => [...entry.hanja].every((character) => known.has(character.normalize("NFKC")))),
	]));
	const sections = data.format.sections.flatMap((section) => {
		const pool = section.readingContext ? sentenceWordsByType[section.type] || [] : section.type.startsWith("word") || section.type.endsWith("Word") ? words : characters;
		const count = Math.min(section.count, pool.length);
		return count ? [{...section, count}] : [];
	});
	const fullCount = data.format.sections.reduce((sum, section) => sum + section.count, 0);
	const count = sections.reduce((sum, section) => sum + section.count, 0);
	const points = data.format.scoring.pointsBySection;
	const fullPoints = examGroups(data).reduce((sum, section) => sum + section.count * points[section.section], 0);
	const maxPoints = examGroups({...data, format: {...data.format, sections}}).reduce((sum, section) => sum + section.count * points[section.section], 0);
	const passingScore = Math.max(1, Math.ceil(data.format.scoring.passingScore / fullPoints * maxPoints));
	const durationSeconds = Math.max(60, Math.ceil(data.format.durationSeconds * count / fullCount / 60) * 60);
	return {
		...data,
		targets: {characters, words, sentenceWordsByType},
		format: {...data.format, sections, durationSeconds, scoring: {...data.format.scoring, passingScore}},
	};
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

export function makeQuestion(data, type, random = secureRandom, excluded = new Set(), targetSource = null) {
	const section = examSections.find((entry) => entry.type === type);
	if (!section) throw new Error(`알 수 없는 문항 유형: ${type}`);
	if (section.answerField) throw new Error("독해 문항에는 문장 생성기가 필요합니다");
	const entries = type.startsWith("word") || type.endsWith("Word") ? data.words : data.characters;
	const targets = (type.startsWith("word") || type.endsWith("Word") ? data.targets?.words : data.targets?.characters) || entries;
	let available = targets.filter((entry) => !excluded.has(entry.hanja) && (targetSource === null || entry.hanja === targetSource));
	if (!available.length && targetSource === null) available = targets;
	if (type === "strokes" && targetSource === null && available.some((entry) => entry.strokes >= 5)) available = available.filter((entry) => entry.strokes >= 5);
	if (["characterMeaning", "meaningCharacter"].includes(type) && targetSource === null) {
		const clear = available.filter((entry) => entry.meaning.length <= 8 && !/[()/]/u.test(entry.meaning));
		if (clear.length >= section.count) available = clear;
	}
	if (["wordMeaning", "meaningWord"].includes(type) && targetSource === null) {
		const clear = available.filter((entry) => entry.meaning.length <= (type === "meaningWord" ? 25 : 30));
		if (clear.length >= section.count) available = clear;
	}
	if (!available.length) throw new Error(`문항 자료가 부족합니다: ${type}`);
	const target = shuffle(available, random)[0];
	let stimulus;
	let correct;
	switch (type) {
		case "strokes": stimulus = target.hanja; correct = String(target.strokes); break;
		case "radical": stimulus = target.hanja; correct = target.radical; break;
		case "characterSound": stimulus = target.hanja; correct = target.sound; break;
		case "soundCharacter": stimulus = target.sound; correct = target.hanja; break;
		case "characterMeaning": stimulus = target.hanja; correct = target.meaning; break;
		case "meaningCharacter": stimulus = target.meaning; correct = target.hanja; break;
		case "wordSound": stimulus = target.hanja; correct = target.reading; break;
		case "soundWord": stimulus = target.reading; correct = target.hanja; break;
		case "wordMeaning": stimulus = target.hanja; correct = target.meaning; break;
		case "meaningWord": stimulus = target.meaning; correct = target.hanja; break;
	}
	const choices = examChoices(type, target, entries, random);
	return {
		type, title: section.title, section: section.section, instruction: section.instruction,
		stimulus, choices, correct, source: target.hanja,
		explanation: "reading" in target ? `${target.hanja} · ${target.reading} · ${target.meaning}` : `${target.hanja} · ${target.sound} · ${target.meaning} · ${target.strokes}획 · 부수 ${target.radical}`,
	};
}

export async function makeQuestionAsync(data, type, sentenceProvider, random = secureRandom, excluded = new Set()) {
	const section = examSections.find((entry) => entry.type === type);
	if (!section?.answerField) return makeQuestion(data, type, random, excluded);
	const targets = data.targets?.sentenceWordsByType?.[type] || data.sentenceWordsByType?.[type] || [];
	let available = targets.filter((entry) => !excluded.has(entry.hanja));
	if (!available.length) available = targets;
	if (!available.length) throw new Error("독해 한자어가 부족합니다");
	if (type === "sentenceMeaning") {
		const clear = available.filter((entry) => entry.meaning.length <= 30);
		if (clear.length >= section.count) available = clear;
	}
	const target = shuffle(available, random)[0];
	const response = await sentenceProvider(target.hanja, type);
	if (response.hanja !== target.hanja || !["ChatGPT", "KRDict"].includes(response.source) || !response.sentence.includes(target.hanja)) throw new Error("독해 문장 응답이 올바르지 않습니다");
	const correct = target[section.answerField];
	const at = response.sentence.indexOf(target.hanja);
	return {
		type, title: section.title, section: section.section, instruction: section.instruction,
		stimulus: response.sentence, stimulusParts: [response.sentence.slice(0, at), target.hanja, response.sentence.slice(at + target.hanja.length)],
		choices: examChoices(type, target, data.words, random), correct, source: target.hanja,
		explanation: `${target.hanja} · ${target.reading} · ${target.meaning}${response.source === "KRDict" ? " · 국립국어원 한국어기초사전 예문" : ""}`,
	};
}

export async function makeExamAsync(data, sentenceProvider, random = secureRandom, onProgress = () => {}) {
	const questions = [];
	const total = examGroups(data).reduce((sum, section) => sum + section.count, 0);
	for (const section of examGroups(data)) {
		const used = new Set();
		for (let index = 0; index < section.count; index++) {
			const question = await makeQuestionAsync(data, section.type, sentenceProvider, random, used);
			used.add(question.source);
			questions.push({...question, number: questions.length + 1});
			onProgress(questions.length, total);
		}
	}
	return questions;
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
