import assert from "node:assert/strict";
import test from "node:test";
import { buildLevelIndex, filterAndSortIdioms, idiomCharacters, idiomLevel, idiomStatusInfo } from "./idiom-filter.js";

const entries = [
	{korean: "각양각색", hanja: "各樣各色", sources: ["nikl"], sourceOrders: {nikl: 1}},
	{korean: "안성맞춤", hanja: "安城--", partial: true, sources: ["nikl"], sourceOrders: {nikl: 2}},
	{korean: "각주구검", hanja: "刻舟求劍", sources: ["exam"], sourceOrders: {exam: 3}, page: 148},
];

test("extracts only Hanja from NIKL notation", () => {
	assert.deepEqual(idiomCharacters(entries[1]), ["安", "城"]);
	assert.deepEqual(idiomCharacters({hanja: "金枝玉葉"}), ["金", "枝", "玉", "葉"]);
});

test("normalizes compatibility Hanja when searching", () => {
	const compatibilityEntry = {korean: "금지옥엽", hanja: "金枝玉葉", sources: ["nikl"], sourceOrders: {nikl: 3}};
	assert.deepEqual(filterAndSortIdioms([compatibilityEntry], "金", new Set(), false, "source", "nikl").map((entry) => entry.korean), ["금지옥엽"]);
});

test("matches idiom status by normalized Hanja or Hangul", () => {
	assert.equal(idiomStatusInfo({korean: "금지옥엽", hanja: "金枝玉葉"}, {金枝玉葉: {status: "known"}}).status, "known");
	assert.equal(idiomStatusInfo({korean: "일자천금", hanja: "一字千金"}, {일자천금: {status: "new"}}).status, "new");
});

test("filters by Hangul and selected Hanja", () => {
	assert.equal(filterAndSortIdioms(entries, "맞춤", new Set(), false, "source").length, 1);
	assert.deepEqual(filterAndSortIdioms(entries, "", new Set(["安", "城"]), true, "source").map((entry) => entry.korean), ["안성맞춤"]);
});

test("filters and orders entries by source", () => {
	assert.deepEqual(filterAndSortIdioms(entries, "", new Set(), false, "source", "exam").map((entry) => entry.korean), ["각주구검"]);
	assert.deepEqual(filterAndSortIdioms(entries, "", new Set(), false, "source", "nikl").map((entry) => entry.korean), ["각양각색", "안성맞춤"]);
	assert.deepEqual(filterAndSortIdioms(entries, "", new Set(), false, "source", "all").map((entry) => entry.korean), ["각주구검", "각양각색", "안성맞춤"]);
});

test("sorts by page and puts entries without a page last", () => {
	assert.deepEqual(filterAndSortIdioms(entries, "", new Set(), false, "page", "all").map((entry) => entry.korean), ["각주구검", "각양각색", "안성맞춤"]);
});

test("classifies idioms by their hardest character and preserves other filters", () => {
	const index = buildLevelIndex({groups: [
		{level: "8급", characters: ["一", "金", "枝", "玉", "葉", "安"]},
		{level: "7급", characters: ["字", "千", "城"]},
		{level: "6급", characters: ["刻", "舟", "求", "劍"]},
	]});
	const cases = [
		{korean: "일자천금", hanja: "一字千金", sources: ["exam"]},
		{korean: "금지옥엽", hanja: "金枝玉葉", sources: ["nikl"]},
		{korean: "각주구검", hanja: "刻舟求劍", sources: ["exam"]},
		{korean: "안성맞춤", hanja: "安城--", partial: true, sources: ["nikl"]},
		{korean: "없는 글자", hanja: "未知", sources: ["exam"]},
	];
	assert.deepEqual(cases.map((entry) => idiomLevel(entry, index)), ["7급", "8급", "6급", "unknown", "unknown"]);
	assert.deepEqual(filterAndSortIdioms(cases, "", new Set(), false, "korean", "exam", "7급", index).map((entry) => entry.korean), ["일자천금"]);
	assert.deepEqual(filterAndSortIdioms(cases, "", new Set(), false, "korean", "nikl", "unknown", index).map((entry) => entry.korean), ["안성맞춤"]);
});
