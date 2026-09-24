import assert from "node:assert/strict";
import test from "node:test";
import { normalizeDeckName, preferredDeck } from "./deck-names.js";

test("normalizes deck names for case and separators", () => {
	assert.equal(normalizeDeckName(" DOK-EUM::Main "), "dokeummain");
});

test("selects the first deck whose normalized name contains the preferred name", () => {
	const decks = ["기타", "한자::A. 8~3 독음", "DOK-EUM backup"];
	assert.equal(preferredDeck(decks, ["독음", "dokeum"]), "한자::A. 8~3 독음");
});

test("recognizes a romanized idiom deck name", () => {
	assert.equal(preferredDeck(["General", "Study::Saja Songon"], ["사자성어", "sajasongon"]), "Study::Saja Songon");
});
