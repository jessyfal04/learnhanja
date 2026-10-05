import assert from "node:assert/strict";
import test from "node:test";
import { expandCatalog, relatedVocabulary, searchVocabulary } from "./vocabulary-data.js";

const entries = expandCatalog([
	["族譜", "족보", ["genealogy"], ["족보"], 0, 20],
	["家族", "가족", ["family"], ["가족"], 0, 2],
	["人人", "인인", ["people"], [], 1, 0],
	["人", "인", ["person", "name"], [], 2, 1],
	["金屬", "금속", ["metal"], [], 0, 40],
	["𠀀", "테스트", [], [], 0, 0],
]);

test("expands the third frequency rank", () => {
	const [entry] = expandCatalog([["人", "인", [], [], 3, 2, 1]]);
	assert.equal(entry.hermitDaveRank, 1);
});

test("selection search requires every character and sorts by mean rank", () => {
	const result = searchVocabulary(entries, ["人"], 10);
	assert.equal(result.total, 2);
	assert.deepEqual(result.entries.map((entry) => entry.hanja), ["人人", "人"]);
	assert.deepEqual(result.entries[1].meanings, ["person", "name"]);
});

test("related search matches any character without duplicates", () => {
	assert.deepEqual(relatedVocabulary(entries, ["族", "譜"]).map((entry) => entry.hanja), ["家族", "族譜"]);
	assert.deepEqual(relatedVocabulary(entries, ["金"]).map((entry) => entry.hanja), ["金屬"]);
	assert.deepEqual(relatedVocabulary(entries, ["𠀀"]).map((entry) => entry.hanja), ["𠀀"]);
	assert.deepEqual(relatedVocabulary(entries, ["abc"]), []);
});

test("selection search applies its result limit after counting all matches", () => {
	const result = searchVocabulary(entries, ["人"], 1);
	assert.equal(result.total, 2);
	assert.equal(result.entries.length, 1);
});
