import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { filterRelated, levelFor, parseText, referenceFor, statusFor, studyInfo } from "./insight-data.js";

const data = JSON.parse(readFileSync(new URL("../data/insights.json", import.meta.url)));
const catalog = JSON.parse(readFileSync(new URL("../data/levels.json", import.meta.url)));
const entries = [
	{hanja: "旣出", hangul: "기출", meanings: ["previously set"]},
	{hanja: "族譜", hangul: "족보", meanings: ["genealogy"]},
	{hanja: "家族", hangul: "가족", meanings: ["family"]},
	{hanja: "既出", hangul: "기출", meanings: []},
	{hanja: "旣譜", hangul: "test", meanings: []},
];
const options = {text: "旣出族譜", characters: [..."旣出族譜"], data};

test("input preserves first occurrence order, counts repeats, normalizes compatibility and handles supplementary Han", () => {
	const parsed = parseText("金金 旣出族譜! 한국 𠀀");
	assert.equal(parsed.total, 7);
	assert.deepEqual(parsed.characters.map((c) => c.character), [..."金旣出族譜𠀀"]);
	assert.deepEqual(parsed.characters[0], {character: "金", originals: ["金", "金"], count: 2});
	assert.deepEqual(parsed.ignored, ["!", "한", "국"]);
	assert.equal(parseText("안녕!? ").characters.length, 0);
});

test("relationship filters distinguish substring, set membership, exact text, and related forms", () => {
	assert.equal(filterRelated(entries, options).length, 5);
	assert.deepEqual(filterRelated(entries, {...options, mode: "inside"}).map((e) => e.hanja), ["旣出", "族譜"]);
	assert.deepEqual(filterRelated(entries, {...options, mode: "only"}).map((e) => e.hanja), ["旣出", "族譜", "旣譜"]);
	assert.deepEqual(filterRelated(entries, {...options, mode: "exact"}), []);
	assert.deepEqual(filterRelated(entries, {...options, focus: "旣"}).map((e) => e.hanja), ["旣出", "旣譜"]);
	assert.deepEqual(filterRelated(entries, {...options, focus: "旣", variants: true}).map((e) => e.hanja), ["旣出", "既出", "旣譜"]);
	assert.equal(filterRelated(entries, {...options, query: "family"})[0].hanja, "家族");
	assert.equal(filterRelated(entries, {...options, text: "旣 出", mode: "inside"}).length, 0);
	assert.equal(filterRelated([{hanja: "安城--", partial: true}], {...options, characters: [..."安城"], mode: "only"}).length, 0);
});

test("the requested example has Korean readings and explicit variant matching", () => {
	assert.deepEqual([..."旣出族譜"].map((c) => referenceFor(c, data).sound), ["기", "출", "족", "보"]);
	assert.ok(referenceFor("旣", data).variants.includes("既"));
	assert.equal(referenceFor("旣", data).definition, "already; de facto; since; then");
	assert.match(referenceFor("譜", data).definition, /register/);
	for (const entry of Object.values(data.characters)) {
		for (const field of ["mandarin", "japanese", "heisig", "learningNote"]) assert.equal(entry[field], undefined);
	}
	for (const c of "旣出族譜") assert.ok(levelFor(c, catalog));
	assert.deepEqual(referenceFor("𠀀", data), {});
});

test("status distinguishes disconnected, absent, new and suspended compatibility forms", () => {
	assert.equal(statusFor("金", null), "미확인");
	assert.equal(statusFor("金", {characters: {}}), "카드 없음");
	assert.equal(statusFor("金", {characters: {"金": {status: "new", suspended: true}}}), "새 카드 · 일시 중단");
});


test("level badge colors distinguish learned, new, missing and unverified state", () => {
	assert.equal(studyInfo("旣", {characters: {"旣": {status: "known"}}}).color, "is-success");
	assert.equal(studyInfo("出", {characters: {"出": {status: "new"}}}).color, "is-info");
	assert.equal(studyInfo("族", {characters: {}}).color, "is-dark");
	assert.equal(studyInfo("譜", null).color, "is-dark");
	assert.equal(studyInfo("譜", {characters: {"譜": {status: "unknown"}}}).label, "상태 없음");
	assert.equal(studyInfo("既", {characters: {"旣": {status: "known"}}}).status, "absent");
});
