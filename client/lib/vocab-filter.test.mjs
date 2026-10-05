import assert from "node:assert/strict";
import test from "node:test";
import { filterAndSortVocabulary, vocabularyKnowledge } from "./vocab-filter.js";

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

test("classifies Migaku words and unknown words made only from learned Hanja", () => {
	const knownWords = new Set(["인"]);
	const ankiStatus = {characters: {人: {status: "known"}, 月: {status: "known"}, 金: {status: "known"}}};
	assert.equal(vocabularyKnowledge(entries[1], knownWords, new Set(), ankiStatus), "known");
	assert.equal(vocabularyKnowledge(entries[0], knownWords, new Set(), ankiStatus), "target");
	assert.equal(vocabularyKnowledge({hanja: "金月", hangul: "금월"}, knownWords, new Set(), ankiStatus), "target");
	assert.equal(vocabularyKnowledge({hanja: "山", hangul: "산"}, knownWords, new Set(), ankiStatus), "unknown");
	assert.equal(vocabularyKnowledge({hanja: "山", hangul: "산"}, knownWords, new Set(["산"]), ankiStatus), "marked");
	assert.equal(vocabularyKnowledge(entries[0], null, new Set(), ankiStatus), "unverified");
});

test("puts unknown words made from learned Hanja first, ordered by frequency", () => {
	const values = [
		{hanja: "人", hangul: "인", meanings: [], niklRank: 1},
		{hanja: "山", hangul: "산", meanings: [], niklRank: 2},
		{hanja: "月", hangul: "월", meanings: [], niklRank: 20},
		{hanja: "金", hangul: "금", meanings: [], niklRank: 5},
	];
	const knowledge = {knownWords: new Set(["인"]), markedWords: new Set(), ankiStatus: {characters: {月: {status: "known"}, 金: {status: "known"}}}};
	const sorted = filterAndSortVocabulary(values, "", "", "unknown-known-hanja", knowledge);
	assert.deepEqual(sorted.map((entry) => entry.hangul), ["금", "월", "산", "인"]);
});

test("filters all, known, or unknown words while retaining study targets as unknown", () => {
	const values = [
		{hanja: "人", hangul: "인", meanings: [], niklRank: 1},
		{hanja: "山", hangul: "산", meanings: [], niklRank: 2},
		{hanja: "月", hangul: "월", meanings: [], niklRank: 3},
	];
	const knowledge = {knownWords: new Set(["인"]), markedWords: new Set(["산"]), ankiStatus: {characters: {月: {status: "known"}}}};
	assert.deepEqual(filterAndSortVocabulary(values, "", "", "frequency", knowledge, "all").map((entry) => entry.hangul), ["인", "산", "월"]);
	assert.deepEqual(filterAndSortVocabulary(values, "", "", "frequency", knowledge, "known").map((entry) => entry.hangul), ["인"]);
	assert.deepEqual(filterAndSortVocabulary(values, "", "", "frequency", knowledge, "unknown").map((entry) => entry.hangul), ["산", "월"]);
});
