import assert from "node:assert/strict";
import test from "node:test";
import { filterAndSortIdioms, idiomCharacters } from "./idiom-filter.js";

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
