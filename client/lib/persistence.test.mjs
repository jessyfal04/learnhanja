import test from "node:test";
import assert from "node:assert/strict";

import { createSnapshot, validateSnapshot } from "./persistence.js";

test("createSnapshot normalizes and deduplicates selection", () => {
	const now = new Date("2026-09-09T00:00:00Z");
	const snapshot = createSnapshot({
		deck: " Hanja ", noteType: "Hanja", characterField: "Char",
	}, ["日", "人", "人"], now);
	assert.deepEqual(snapshot.selected, ["人", "日"]);
	assert.equal(snapshot.deck, "Hanja");
	assert.equal(snapshot.savedAt, "2026-09-09T00:00:00.000Z");
});

test("validateSnapshot rejects invalid files", () => {
	assert.throws(() => validateSnapshot({}), /invalid deck/);
	assert.throws(() => validateSnapshot({
		deck: "d", noteType: "n", characterField: "c", selected: ["abc"],
	}), /invalid Hanja/);
});

test("selection does not require Anki configuration", () => {
	assert.doesNotThrow(() => validateSnapshot({deck: "", noteType: "", characterField: "", selected: ["人"]}));
});
