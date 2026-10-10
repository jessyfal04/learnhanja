import assert from "node:assert/strict";
import test from "node:test";
import { characterDeckPresentation } from "./character-deck-status.js";

test("learned shape with new suspended reading uses light danger", () => {
	assert.deepEqual(characterDeckPresentation(
		{status: "new", suspended: true},
		{status: "known"},
		{status: "new"},
	), {
		classes: "is-danger is-light",
		label: "독음 새 카드 · 일시 중단 · 모양 학습함 · 훈음 새 카드",
	});
});

test("learned reading keeps its existing color", () => {
	assert.equal(characterDeckPresentation({status: "known"}, {status: "known"}, null).classes, "is-success");
	assert.equal(characterDeckPresentation({status: "new", suspended: true}, {status: "new"}, null).classes, "is-danger");
});

test("active new reading stays blue when shape is learned and huneum is suspended", () => {
	assert.deepEqual(characterDeckPresentation(
		{status: "new"},
		{status: "known"},
		{status: "new", suspended: true},
	), {
		classes: "is-info",
		label: "독음 새 카드 · 모양 학습함 · 훈음 새 카드 · 일시 중단",
	});
});
