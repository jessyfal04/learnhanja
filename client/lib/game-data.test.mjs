import assert from "node:assert/strict";
import test from "node:test";
import { allHanjaKnown, buildBalancedMatchRound, buildMatchRound, buildMixedQuestion, entryKey, gameEntries, knownGameEntries, randomizedGameEntries, rankGameEntries, unknownGameEntries, wordIsKnown } from "./game-data.js";

const catalog = [
	{hanja: "價格", hangul: "가격", definitions: ["값"], niklRank: 20},
	{hanja: "加擊", hangul: "가격", definitions: ["때림"], niklRank: 40},
	{hanja: "經濟", hangul: "경제", definitions: ["생산과 소비"], niklRank: 3},
	{hanja: "國家", hangul: "국가", definitions: ["나라"], niklRank: 2},
	{hanja: "發展", hangul: "발전", definitions: ["더 나아짐"], niklRank: 4},
];
const knownCharacters = {characters: Object.fromEntries(Array.from("價格加擊經濟國家發展", (character) => [character.normalize("NFKC"), {status: "known"}]))};

test("known vocabulary with entirely known Hanja is eligible", () => {
	assert.deepEqual(knownGameEntries(catalog, new Set(["가격"]), knownCharacters, {requireDefinition: true}).map((entry) => entry.hanja), ["價格", "加擊"]);
});

test("a known word containing an unknown or suspended Hanja is excluded", () => {
	const missing = {characters: {...knownCharacters.characters}};
	delete missing.characters.格;
	assert.equal(allHanjaKnown(catalog[0], missing), false);
	missing.characters.格 = {status: "known", suspended: true};
	assert.equal(allHanjaKnown(catalog[0], missing), false);
});

test("unknown vocabulary made from known Hanja enters unknown mode", () => {
	assert.deepEqual(unknownGameEntries(catalog, new Set(["가격"]), new Set(), knownCharacters).map((entry) => entry.hangul), ["국가", "경제", "발전"]);
});

test("word and Hanja filters can be applied independently", () => {
	const partialCharacters = {characters: {...knownCharacters.characters}};
	delete partialCharacters.characters.格;
	assert.equal(gameEntries(catalog, new Set(["가격"]), partialCharacters, {wordMode: "known", hanjaMode: "all"}).length, 2);
	assert.equal(gameEntries(catalog, new Set(["가격"]), partialCharacters, {wordMode: "all", hanjaMode: "known"}).some((entry) => entry.hanja === "價格"), false);
	assert.equal(gameEntries(catalog, new Set(["가격"]), partialCharacters, {wordMode: "all", hanjaMode: "all"}).length, catalog.length);
	assert.equal(wordIsKnown(catalog[0], new Set(["가격"])), true);
});

test("marked unknown vocabulary receives priority", () => {
	assert.equal(unknownGameEntries(catalog, new Set(), new Set(["발전"]), knownCharacters)[0].hangul, "발전");
});

test("normal matching rounds do not contain duplicate Hangul labels", () => {
	const round = buildMatchRound(catalog, 4);
	assert.equal(new Set(round.map((entry) => entry.hangul)).size, round.length);
});

test("mixed matching rounds balance known and unknown words", () => {
	const known = [
		{hanja: "國家", hangul: "국가", niklRank: 1},
		{hanja: "學生", hangul: "학생", niklRank: 2},
		{hanja: "學問", hangul: "학문", niklRank: 3},
	];
	const unknown = [
		{hanja: "發展", hangul: "발전", niklRank: 1},
		{hanja: "經濟", hangul: "경제", niklRank: 2},
		{hanja: "國民", hangul: "국민", niklRank: 3},
	];
	const round = buildBalancedMatchRound(known, unknown, 4);
	assert.equal(round.filter((entry) => known.includes(entry)).length, 2);
	assert.equal(round.filter((entry) => unknown.includes(entry)).length, 2);
	assert.equal(new Set(round.map((entry) => entry.hanja)).size, 4);
});

test("randomized pools vary broadly and keep recent cards at the back", () => {
	const entries = Array.from({length: 12}, (_, index) => ({hanja: `學${String.fromCodePoint(0x4e00 + index)}`, hangul: `단어${index}`, niklRank: index + 1}));
	let value = 0;
	const ascending = () => (value = (value + 0.17) % 1);
	let otherValue = 0.91;
	const descending = () => (otherValue = (otherValue + 0.73) % 1);
	const first = randomizedGameEntries(entries, {desired: 4, random: ascending, previousEntries: [entries[0]]});
	const second = randomizedGameEntries(entries, {desired: 4, random: descending, previousEntries: [entries[0]]});
	assert.notDeepEqual(first.slice(0, 4).map(entryKey), second.slice(0, 4).map(entryKey));
	assert.equal(first.at(-1), entries[0]);
	assert.equal(new Set(first.map(entryKey)).size, entries.length);
});

test("mixed questions preserve the exact collision entry and prefer its sibling", () => {
	const question = buildMixedQuestion(catalog[0], catalog, {choiceCount: 4, ankiStatus: knownCharacters});
	assert.equal(question.entry, catalog[0]);
	assert.equal(question.correct, "價格");
	assert.equal(question.choices[1], "加擊");
	assert.equal(new Set(question.choices).size, question.choices.length);
});

test("compatibility Hanja and decomposed Hangul normalize for eligibility", () => {
	const entry = {hanja: "金", hangul: "금", definitions: ["쇠"]};
	assert.equal(knownGameEntries([entry], new Set(["금"]), {characters: {金: {status: "known"}}}).length, 1);
});

test("exposure balancing influences close entries without overriding a large frequency gap", () => {
	const close = [
		{hanja: "國家", hangul: "국가", niklRank: 100},
		{hanja: "發展", hangul: "발전", niklRank: 110},
	];
	assert.equal(rankGameEntries(close, {exposures: {國: 3, 家: 3}})[0].hangul, "발전");
	const far = [{hanja: "國家", hangul: "국가", niklRank: 1}, {hanja: "發展", hangul: "발전", niklRank: 5000}];
	assert.equal(rankGameEntries(far, {exposures: {國: 3, 家: 3}})[0].hangul, "국가");
});
