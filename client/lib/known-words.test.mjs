import assert from "node:assert/strict";
import test from "node:test";
import { fetchKnownWords, parseKnownWords } from "./known-words.js";

test("TXT words are NFC-normalized and deduplicated", () => {
	assert.deepEqual([...parseKnownWords("\uFEFF가게\r\n가게\n가격\n\n")], ["가게", "가격"]);
});

test("local port uses the known-words action and checks the response", async () => {
	const result = await fetchKnownWords("8766", async (url, options) => {
		assert.equal(url, "http://127.0.0.1:8766/");
		assert.equal(JSON.parse(options.body).action, "getKnownWords");
		return {ok: true, json: async () => ({result: {words: ["가게", "가게", "가격"], markedWords: ["도구", "도구"]}, error: null})};
	});
	assert.deepEqual([...result.knownWords], ["가게", "가격"]);
	assert.deepEqual([...result.markedWords], ["도구"]);
	await assert.rejects(fetchKnownWords("8766", async () => ({ok: true, json: async () => ({result: null, error: "failed"})})), /failed/u);
});
