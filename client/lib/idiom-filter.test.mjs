import assert from "node:assert/strict";
import test from "node:test";
import { filterAndSortIdioms, idiomCharacters } from "./idiom-filter.js";

const entries = [
	{korean: "각양각색", hanja: "各樣各色"},
	{korean: "안성맞춤", hanja: "安城--", partial: true},
];

test("extracts only Hanja from NIKL notation", () => {
	assert.deepEqual(idiomCharacters(entries[1]), ["安", "城"]);
	assert.deepEqual(idiomCharacters({hanja: "金枝玉葉"}), ["金", "枝", "玉", "葉"]);
});

test("filters by Hangul and selected Hanja", () => {
	assert.equal(filterAndSortIdioms(entries, "맞춤", new Set(), false, "source").length, 1);
	assert.deepEqual(filterAndSortIdioms(entries, "", new Set(["安", "城"]), true, "source").map((entry) => entry.korean), ["안성맞춤"]);
});
