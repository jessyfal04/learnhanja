import assert from "node:assert/strict";
import test from "node:test";
import { ankiDeckNewCount, ankiOpenDeck, buildCharacterStatus, buildIdiomStatus } from "./anki-connect.js";

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

test("builds sorted chapter metadata from optional amgi1 fields", () => {
	const chapterNotes = [
		{noteId: 1, fields: {Char: {value: "<b>一三</b>"}, amgi1: {value: "<i>013</i>"}}},
		{noteId: 2, fields: {Char: {value: "三"}, amgi1: {value: "014"}}},
		{noteId: 3, fields: {Char: {value: "二"}, amgi1: {value: "2"}}},
		{noteId: 4, fields: {Char: {value: "四"}, amgi1: {value: "0"}}},
		{noteId: 5, fields: {Char: {value: "五"}, amgi1: {value: "chapter 5"}}},
		{noteId: 6, fields: {Char: {value: "六"}, amgi1: {value: ""}}},
	];
	const result = buildCharacterStatus(chapterNotes, "Char", new Set(), new Set(), new Set());
	assert.equal(result.characters.一.chapter, 13);
	assert.equal(result.characters.三.chapter, 13);
	assert.equal(result.characters.四.chapter, undefined);
	assert.deepEqual(result.chapters, [
		{chapter: 2, characters: ["二"]},
		{chapter: 13, characters: ["一", "三"]},
	]);
});

test("builds whole-idiom status and gives known precedence", () => {
	const result = buildIdiomStatus(notes, "Char", new Set([1, 3]), new Set([2]), new Set([2]));
	assert.equal(result.total, 2);
	assert.equal(result.known, 2);
	assert.equal(result.idioms.金枝玉葉.status, "known");
	assert.equal(result.idioms.弱肉強食.noteCount, 2);
	assert.equal(result.idioms.弱肉強食.suspended, false);
});

test("keeps learned-active precedence over duplicate suspended notes", () => {
	const result = buildIdiomStatus(notes, "Char", new Set([3]), new Set([2]), new Set([2]));
	assert.deepEqual(result.idioms.弱肉強食, {status: "known", suspended: false, noteCount: 2});
	const suspended = buildIdiomStatus(notes.slice(0, 1), "Char", new Set([1]), new Set(), new Set([1]));
	assert.deepEqual(suspended.idioms.金枝玉葉, {status: "known", suspended: true, noteCount: 1});
	const activeNew = buildIdiomStatus(notes.slice(1), "Char", new Set([3]), new Set([2]), new Set([3]));
	assert.deepEqual(activeNew.idioms.弱肉強食, {status: "new", suspended: false, noteCount: 2});
});

test("opens the detected deck overview with its complete name", async () => {
	const previousFetch = globalThis.fetch;
	let payload;
	globalThis.fetch = async (_url, options) => {
		payload = JSON.parse(options.body);
		return {ok: true, json: async () => ({result: true, error: null})};
	};
	try {
		await ankiOpenDeck("한자::C. 훈음 X");
		assert.deepEqual(payload, {action: "guiDeckOverview", version: 6, params: {name: "한자::C. 훈음 X"}});
		await assert.rejects(ankiOpenDeck(""), /열 앙키 덱이 없습니다/);
	} finally {
		globalThis.fetch = previousFetch;
	}
});

test("counts active new cards in a deck", async () => {
	const previousFetch = globalThis.fetch;
	const queries = [];
	globalThis.fetch = async (_url, options) => {
		const {action, params} = JSON.parse(options.body);
		assert.equal(action, "findCards");
		queries.push(params.query);
		const result = [1, 2];
		return {ok: true, json: async () => ({result, error: null})};
	};
	try {
		assert.equal(await ankiDeckNewCount("한자::A. 모양"), 2);
		assert.deepEqual(queries, [
			'deck:"한자::A. 모양" is:new -is:suspended',
		]);
	} finally {
		globalThis.fetch = previousFetch;
	}
});
