import assert from "node:assert/strict";
import test from "node:test";
import { competitionRanks, rankChapters, recommendHanja } from "./recommendations.js";

const catalog = {
	groups: [
		{level: "8급", characters: ["一", "二", "四"]},
		{level: "준7급", characters: ["三", "五"]},
	],
};

test("uses active-known status and missing count while excluding completed chapters", () => {
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
	assert.deepEqual(result.map((entry) => entry.chapter), [1, 2]);
	assert.deepEqual(result.map((entry) => entry.missingCharacters), [["二"], ["三"]]);
	assert.deepEqual(result.map((entry) => entry.completionRank), [1, 1]);
	assert.equal(result[0].bookOrderRank, 1);
	assert.equal(result[1].bookOrderRank, 2);
	assert.ok(result[0].finalScore < result[1].finalScore);
	for (const entry of result) {
		assert.equal(entry.finalScore, (entry.completionRank + entry.vocabUnlockRank + entry.levelFitRank + entry.bookOrderRank) / 4);
	}
});

test("counts only unique newly unlocked Migaku KNOWN words", () => {
	const ankiStatus = {
		characters: {
			一: {status: "known", suspended: false},
			二: {status: "new", suspended: false},
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
		characters: {一: {status: "known"}, 二: {status: "new"}, 三: {status: "new"}, 龍: {status: "new"}},
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
