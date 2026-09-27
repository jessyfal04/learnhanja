import assert from "node:assert/strict";
import test from "node:test";

import { filterAndSortSentences, sentenceProgress } from "./cheonjamun-data.js";

const sentence = (number, characters) => ({
	number,
	phrases: [
		[...characters.slice(0, 4)].map((display) => ({display, match: display})),
		[...characters.slice(4)].map((display) => ({display, match: display})),
	],
});

test("sentence progress uses active learned status and study-match characters", () => {
	const item = sentence(1, "天地玄黃宇宙洪荒");
	item.phrases[0][0].match = "天";
	const progress = sentenceProgress(item, {
		statuses: {characters: {天: {status: "known"}, 地: {status: "known", suspended: true}, 玄: {status: "new"}}},
		selected: new Set(["天", "地"]),
		catalog: new Set(["天", "地", "玄"]),
	});
	assert.deepEqual(progress, {known: 1, selected: 2, cataloged: 3, total: 8, verified: true});
});

test("frontier puts the closest incomplete sentence first and completed sentences last", () => {
	const sentences = [sentence(1, "天地玄黃宇宙洪荒"), sentence(2, "日月盈昃辰宿列張"), sentence(3, "寒來暑往秋收冬藏")];
	const statuses = {characters: {}};
	for (const character of "天地玄黃宇宙洪荒") statuses.characters[character] = {status: "known"};
	for (const character of "日月盈昃辰宿列") statuses.characters[character] = {status: "known"};
	const result = filterAndSortSentences(sentences, {sort: "frontier", statuses});
	assert.deepEqual(result.map(({sentence: item}) => item.number), [2, 3, 1]);
});

test("selected filter retains sentences containing a selected study form", () => {
	const sentences = [sentence(1, "天地玄黃宇宙洪荒"), sentence(2, "日月盈昃辰宿列張")];
	const result = filterAndSortSentences(sentences, {filter: "selected", selected: new Set(["月"])});
	assert.deepEqual(result.map(({sentence: item}) => item.number), [2]);
});
