import assert from "node:assert/strict";
import test from "node:test";
import { buildChapterCandidates, competitionRanks, normalizedRecommendationWeights, rankChapterCandidates, rankChapters, recommendHanja } from "./recommendations.js";

const catalog = {
	groups: [
		{level: "8급", characters: ["一", "二", "四"]},
		{level: "준7급", characters: ["三", "五"]},
	],
};

test("excludes active known and active new cards from candidate characters", () => {
	const ankiStatus = {
		characters: {
			一: {status: "known", suspended: false},
			二: {status: "known", suspended: true},
			三: {status: "new", suspended: false},
			四: {status: "known", suspended: false},
			五: {status: "known", suspended: false},
		},
		chapters: [
			{chapter: 1, characters: ["一", "二"]},
			{chapter: 2, characters: ["一", "三", "四", "五"]},
			{chapter: 3, characters: ["一", "四", "五"]},
		],
	};
	const result = rankChapters({ankiStatus, knownWords: new Set(), vocabulary: [], catalog});
	assert.deepEqual(result.map((entry) => entry.chapter), [1]);
	assert.deepEqual(result.map((entry) => entry.missingCharacters), [["二"]]);
	assert.deepEqual(result.map((entry) => entry.completionRank), [1]);
	assert.equal(result[0].bookOrderRank, 1);
	for (const entry of result) {
		assert.equal(entry.finalScore, (entry.completionRank + entry.vocabUnlockRank + entry.levelFitRank + entry.bookOrderRank) / 4);
	}
});

test("counts only unique newly unlocked Migaku KNOWN words", () => {
	const ankiStatus = {
		characters: {
			一: {status: "known", suspended: false},
			二: {status: "new", suspended: true},
			三: {status: "unknown", suspended: false},
			四: {status: "unknown", suspended: false},
		},
		chapters: [{chapter: 10, characters: ["二", "三"]}],
	};
	const vocabulary = [
		{hangul: "갑", hanja: "一二"},
		{hangul: "갑", hanja: "二一"},
		{hangul: "을", hanja: "二三"},
		{hangul: "병", hanja: "一"},
		{hangul: "정", hanja: "二四"},
		{hangul: "표시", hanja: "三"},
		{hangul: "미등록", hanja: "三"},
	];
	const result = rankChapters({
		ankiStatus,
		knownWords: new Set(["갑", "을", "병", "정"]),
		markedWords: new Set(["표시"]),
		vocabulary,
		catalog,
	});
	assert.equal(result[0].vocabUnlockCount, 2);
	assert.deepEqual(result[0].unlockedWords.map((word) => word.hangul), ["갑", "을"]);
	assert.deepEqual(result[0].recommendedCharacters.map((entry) => [entry.character, entry.contributionCount]), [["二", 2], ["三", 1]]);
});

test("uses the mean missing-character difficulty and treats outside characters as hardest", () => {
	const ankiStatus = {
		characters: {一: {status: "known"}, 二: {status: "new", suspended: true}, 三: {status: "new", suspended: true}, 龍: {status: "new", suspended: true}},
		chapters: [
			{chapter: 1, characters: ["一", "三"]},
			{chapter: 2, characters: ["二", "龍"]},
			{chapter: 3, characters: ["龍"]},
		],
	};
	const result = rankChapters({ankiStatus, knownWords: new Set(), vocabulary: [], catalog});
	const byChapter = new Map(result.map((entry) => [entry.chapter, entry]));
	assert.equal(byChapter.get(1).levelFitValue, 1);
	assert.equal(byChapter.get(2).levelFitValue, 1);
	assert.equal(byChapter.get(3).levelFitValue, 2);
	assert.equal(byChapter.get(1).levelFitRank, 1);
	assert.equal(byChapter.get(2).levelFitRank, 1);
	assert.equal(byChapter.get(3).levelFitRank, 3);
});

test("active new cards cannot count toward vocabulary unlocked by a chapter", () => {
	const result = rankChapters({
		ankiStatus: {characters: {一: {status: "known"}, 二: {status: "new"}, 三: {status: "unknown"}}, chapters: [{chapter: 1, characters: ["二", "三"]}]},
		knownWords: new Set(["갑", "을"]),
		vocabulary: [{hangul: "갑", hanja: "一三"}, {hangul: "을", hanja: "二三"}],
		catalog,
	});
	assert.deepEqual(result[0].missingCharacters, ["三"]);
	assert.deepEqual(result[0].unlockedWords.map((word) => word.hangul), ["갑"]);
});

test("weighted ranks follow chosen criteria and normalize their shares", () => {
	const ankiStatus = {
		characters: {一: {status: "unknown"}, 二: {status: "unknown"}, 三: {status: "unknown"}},
		chapters: [{chapter: 1, characters: ["一", "二"]}, {chapter: 2, characters: ["三"]}],
	};
	const onlyCompletion = rankChapters({ankiStatus, knownWords: new Set(), vocabulary: [], catalog, weights: {completion: 4, vocabulary: 0, level: 0, order: 0}});
	assert.deepEqual(onlyCompletion.map((entry) => entry.chapter), [2, 1]);
	const onlyOrder = rankChapters({ankiStatus, knownWords: new Set(), vocabulary: [], catalog, weights: {completion: 0, vocabulary: 0, level: 0, order: 4}});
	assert.deepEqual(onlyOrder.map((entry) => entry.chapter), [1, 2]);
	assert.deepEqual(normalizedRecommendationWeights({completion: 1, vocabulary: 3, level: 0, order: 0}), {completion: 0.25, vocabulary: 0.75, level: 0, order: 0});
	assert.deepEqual(normalizedRecommendationWeights({completion: 0, vocabulary: 0, level: 0, order: 0}), {completion: 0.25, vocabulary: 0.25, level: 0.25, order: 0.25});
	const candidates = buildChapterCandidates({ankiStatus, knownWords: new Set(), vocabulary: [], catalog});
	const cachedCharacters = candidates[0].recommendedCharacters;
	assert.deepEqual(rankChapterCandidates(candidates, {completion: 4, vocabulary: 0, level: 0, order: 0}).map((entry) => entry.chapter), [2, 1]);
	assert.deepEqual(rankChapterCandidates(candidates, {completion: 0, vocabulary: 0, level: 0, order: 4}).map((entry) => entry.chapter), [1, 2]);
	assert.strictEqual(candidates[0].recommendedCharacters, cachedCharacters);
	assert.equal(candidates[0].finalScore, undefined);
});

test("uses standard competition ranking for ascending and descending values", () => {
	assert.deepEqual(competitionRanks([10, 10, 20]), [1, 1, 3]);
	assert.deepEqual(competitionRanks([10, 10, 5], true), [1, 1, 3]);
});

test("recommends by contribution, easier level, catalog order, then string order", () => {
	const chapter = {
		missingCharacters: ["五", "三", "四", "二", "龜", "龍", "一"],
		unlockedWords: [
			{hangul: "갑", hanja: "二三", hanjaSpellings: ["二三"]},
			{hangul: "을", hanja: "三四", hanjaSpellings: ["三四"]},
		],
	};
	assert.deepEqual(recommendHanja(chapter, catalog).map((entry) => entry.character), ["三", "二", "四", "一", "五", "龍", "龜"]);
});
