import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { decomposeHanja, filterRelated, hangulCandidates, levelFor, parseText, referenceFor, statusFor, studyInfo } from "./insight-data.js";

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

test("Hangul lookup returns distinct exact vocabulary and idiom spellings", () => {
	const vocabulary = [
		{hanja: "價格", hangul: "가격", definitions: ["값"]},
		{hanja: "加擊", hangul: "가격", definitions: ["때림"]},
		{hanja: "家族", hangul: "가족"},
		{hanja: "人工", hangul: "인공", meanings: ["artificial"]},
		{hanja: "知能", hangul: "지능", meanings: ["intelligence"]},
	];
	const idioms = [{hanja: "鶴首苦待", korean: "학수고대"}, {hanja: "價格", korean: "가격"}];
	assert.deepEqual(hangulCandidates(vocabulary, idioms, "가격").map((entry) => entry.hanja), ["價格", "加擊"]);
	assert.deepEqual(hangulCandidates(vocabulary, idioms, "학수고대").map((entry) => entry.hanja), ["鶴首苦待"]);
	const compound = hangulCandidates(vocabulary, idioms, "인공지능");
	assert.deepEqual(compound.map((entry) => entry.hanja), ["人工知能"]);
	assert.deepEqual(compound[0].components.map(({hangul, hanja}) => ({hangul, hanja})), [{hangul: "인공", hanja: "人工"}, {hangul: "지능", hanja: "知能"}]);
	assert.deepEqual(compound[0].components.map(({meaning}) => meaning), ["artificial", "intelligence"]);
	assert.deepEqual(hangulCandidates(vocabulary, idioms, "가격 정보"), []);
});

test("decomposes exact words by characters and larger compounds by known words", () => {
	const vocabulary = [
		{hanja: "工夫", hangul: "공부", meanings: ["study"]},
		{hanja: "人工", hangul: "인공", meanings: ["artificial"], definitions: ["사람이 만든 것"]},
		{hanja: "知能", hangul: "지능", meanings: ["intelligence"], definitions: ["이해하는 능력"]},
	];
	const references = {characters: {
		工: {sound: "공", hun: "장인 공", definition: "labor; work"},
		夫: {sound: "부", hun: "지아비 부", definition: "man; husband"},
	}};
	assert.deepEqual(decomposeHanja(vocabulary, vocabulary[0], references).components, [
		{hangul: "공", hanja: "工", definition: "장인 공", meaning: "labor; work"},
		{hangul: "부", hanja: "夫", definition: "지아비 부", meaning: "man; husband"},
	]);
	assert.deepEqual(decomposeHanja(vocabulary, {hanja: "人工知能"}, references).components.map(({hangul, hanja}) => ({hangul, hanja})), [
		{hangul: "인공", hanja: "人工"},
		{hangul: "지능", hanja: "知能"},
	]);
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
