import assert from "node:assert/strict";
import test from "node:test";
import { filterAndSortVocabulary } from "./vocab-filter.js";

const entries = [
	{hanja: "月", hangul: "월", meanings: ["moon"], pokemonRank: 20, niklRank: 0},
	{hanja: "人", hangul: "인", meanings: ["person"], pokemonRank: 5, niklRank: 10},
];

test("filters text and maximum frequency rank", () => {
	assert.deepEqual(filterAndSortVocabulary(entries, "person", 10, "frequency").map((entry) => entry.hanja), ["人"]);
});

test("sorts descending Hanja", () => {
	const ascending = filterAndSortVocabulary(entries, "", "", "hanja-asc").map((entry) => entry.hanja);
	const descending = filterAndSortVocabulary(entries, "", "", "hanja-desc").map((entry) => entry.hanja);
	assert.deepEqual(descending, ascending.toReversed());
});
