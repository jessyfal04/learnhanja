import assert from "node:assert/strict";
import test from "node:test";
import { huneumEntries, huneumQuestion } from "./huneum-game-data.js";

const levels = {groups: [{level: "8급", characters: ["一", "日", "月", "金", "國"]}]};
const references = {一: {hun: "한 일"}, 日: {hun: "날 일"}, 月: {hun: "달 월"}, 金: {hun: "쇠 금"}, 國: {hun: "나라 국"}};
const status = {characters: {一: {status: "known"}, 日: {status: "known"}, 月: {status: "known"}, 金: {status: "known"}, 國: {status: "known", suspended: true}}};

test("known mode uses active learned characters and resolves compatibility forms", () => {
	assert.deepEqual(huneumEntries(levels, references, status).map((entry) => entry.character), ["一", "日", "月", "金"]);
	assert.equal(huneumEntries(levels, references, status, "all").length, 5);
});

test("questions contain the exact official huneum and four distinct choices", () => {
	const entries = huneumEntries(levels, references, status);
	const question = huneumQuestion(entries[0], entries, () => 0.5);
	assert.equal(question.correct, "한 일");
	assert.equal(question.choices.length, 4);
	assert.equal(new Set(question.choices).size, 4);
	assert.equal(huneumQuestion(entries[0], entries.slice(0, 3)), null);
});
