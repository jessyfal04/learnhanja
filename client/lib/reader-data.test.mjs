import assert from "node:assert/strict";
import test from "node:test";
import {convertKorean, loadReaderExposure, passageText, recordReaderSession, selectCharacters, selectReaderWords} from "./reader-data.js";

const catalog = [
	{hangul: "경제", hanja: "經濟", definitions: ["살림"], niklRank: 2},
	{hangul: "관찰", hanja: "觀察", definitions: ["살펴봄"], niklRank: 4},
	{hangul: "경찰", hanja: "警察", definitions: ["치안"], niklRank: 3},
	{hangul: "역사", hanja: "歷史", definitions: ["지난 일"], niklRank: 5},
	{hangul: "사과", hanja: "謝過", definitions: ["잘못을 빎"], niklRank: 8},
	{hangul: "사과", hanja: "沙果", definitions: ["과일"], niklRank: 9},
];

test("offline conversion preserves source and refuses homophones, compounds, and inflections", () => {
	const source = "경찰이 관찰했다. 사과를 먹고 경제가 좋아졌다. 경제적인 이야기.";
	const segments = convertKorean(source, catalog);
	assert.equal(passageText(segments), source);
	assert.equal(passageText(segments, "mixed"), "警察이 관찰했다. 사과를 먹고 經濟가 좋아졌다. 경제적인 이야기.");
	assert.equal(passageText(segments, "hangul"), source);
	assert.equal(passageText(segments, "practice"), passageText(segments, "mixed"));
	assert.equal(convertKorean("경찰이 왔다", catalog, new Set(["經", "濟"])) .filter((part) => part.hanja).length, 0);
});

test("context rescue favors failures, sparse exposure, frequent and known words", () => {
	const status = {characters: {察: {status: "known"}, 經: {status: "known"}, 濟: {status: "new"}}};
	assert.deepEqual(selectCharacters("learned", {status, failed: new Set(["察"]), exposures: {經: 10}}), ["察", "經"]);
	const words = selectReaderWords(catalog, ["察"], {knownWords: new Set(["경찰"])});
	assert.equal(words[0].hangul, "경찰");
	assert.deepEqual(words.map((word) => word.hangul).sort(), ["경찰", "관찰"]);
});

test("missing Anki and Migaku states still allow manually chosen characters and dictionary words", () => {
	assert.deepEqual(selectCharacters("learned", {status: null}), []);
	const manual = selectCharacters("selected", {selected: new Set(["察"]), status: null});
	assert.deepEqual(manual, ["察"]);
	assert.equal(selectReaderWords(catalog, manual, {knownWords: new Set()}).length, 2);
});

test("reader excludes combined variant spellings and conjugated catalog entries", () => {
	const entries = [
		{hangul: "기대", hanja: "期待企待", definitions: ["바람"]},
		{hangul: "기대하다", hanja: "期待企待", definitions: ["바라다"]},
		{hangul: "사과", hanja: "沙果砂果", definitions: ["과일"]},
		{hangul: "사과", hanja: "謝過", definitions: ["용서를 빎"]},
		{hangul: "시대", hanja: "時代", definitions: ["때"]},
	];
	assert.deepEqual(selectReaderWords(entries, ["待", "代"]).map((entry) => entry.hangul), ["시대"]);
	assert.equal(passageText(convertKorean("기대와 사과를 먹은 시대", entries), "mixed"), "기대와 사과를 먹은 時代");
});

test("completed reading stores exposure separately from recall and persists through reload", () => {
	const storage = new Map();
	const adapter = {getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key, value)};
	const start = loadReaderExposure(adapter);
	const segments = [{text: "경찰", hanja: "警察"}, {text: "이 왔다. ", hanja: ""}, {text: "관찰", hanja: "觀察"}];
	const result = recordReaderSession(start, segments, {revealed: new Set(["察"]), missed: new Set(["警"])});
	adapter.setItem("learnhanja-reader-exposure-v1", JSON.stringify(result.stats));
	assert.equal(loadReaderExposure(adapter).characters.察, 2);
	assert.equal(loadReaderExposure(adapter).revealed.察, 1);
	assert.equal(loadReaderExposure(adapter).missed.警, 1);
	assert.equal(loadReaderExposure(adapter).sessions, 1);
	assert.equal(start.sessions, 0);
});
