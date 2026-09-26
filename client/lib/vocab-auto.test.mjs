import assert from "node:assert/strict";
import test from "node:test";
import {state} from "./state.js";

const nodes = new Map();
globalThis.document = {
	getElementById(id) {
		if (!nodes.has(id)) nodes.set(id, {value: "", classList: {toggle() {}}, replaceChildren(...children) { this.children = children; }, appendChild(child) { this.children.push(child); }});
		return nodes.get(id);
	},
	createElement(tagName) {
		return {tagName, appendChild(child) { this.child = child; }, append(...children) { this.children = children; }, addEventListener() {}, setAttribute() {}};
	},
};
globalThis.window = {location: {hash: "#connection"}, clearTimeout, setTimeout};
const {buildVocabulary, scheduleVocabulary} = await import("./vocab.js");

test("vocabulary calculates after selection and remains on the current tab", async () => {
	globalThis.fetch = async (path) => {
		assert.equal(path, "/data/vocabulary.json");
		return {ok: true, json: async () => [["人", "인", [], [], 0, 1]]};
	};
	state.selected = new Set(["人"]);
	scheduleVocabulary();
	await new Promise((resolve) => setTimeout(resolve, 300));
	assert.equal(window.location.hash, "#connection");
	assert.equal(state.vocabularyTotal, 1);
	assert.match(document.getElementById("vocabSummary").textContent, /1개 표시/);
	state.selected.clear();
	await buildVocabulary({navigate: false});
	assert.equal(state.vocabularyTotal, 0);
});
