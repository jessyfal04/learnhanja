import assert from "node:assert/strict";
import test from "node:test";
import { buildCharacterStatus, buildIdiomStatus } from "./anki-connect.js";

const notes = [
	{noteId: 1, fields: {Char: {value: "<b>金枝玉葉</b>"}}},
	{noteId: 2, fields: {Char: {value: "弱肉強食"}}},
	{noteId: 3, fields: {Char: {value: "弱肉強食"}}},
];

test("builds character status with compatibility normalization", () => {
	const result = buildCharacterStatus(notes, "Char", new Set([1]), new Set([2, 3]), new Set([3]));
	assert.equal(result.characters.金.status, "known");
	assert.equal(result.characters.強.status, "new");
	assert.equal(result.characters.強.noteCount, 2);
});

test("builds whole-idiom status and gives known precedence", () => {
	const result = buildIdiomStatus(notes, "Char", new Set([1, 3]), new Set([2]), new Set([2]));
	assert.equal(result.total, 2);
	assert.equal(result.known, 2);
	assert.equal(result.idioms.金枝玉葉.status, "known");
	assert.equal(result.idioms.弱肉強食.noteCount, 2);
	assert.equal(result.idioms.弱肉強食.suspended, true);
});
