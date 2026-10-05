import assert from "node:assert/strict";
import test from "node:test";
import { formatFrequencyRank, frequencyMean, frequencyMedian, frequencyRanks } from "./frequency.js";

test("calculates mean and median from three frequency ranks", () => {
	const entry = {pokemonRank: 30, niklRank: 10, hermitDaveRank: 20};
	assert.deepEqual(frequencyRanks(entry), [30, 10, 20]);
	assert.equal(frequencyMean(entry), 20);
	assert.equal(frequencyMedian(entry), 20);
});

test("ignores unavailable ranks and formats aggregate ranks", () => {
	const entry = {pokemonRank: 5, niklRank: 0, hermitDaveRank: 10};
	assert.equal(frequencyMean(entry), 7.5);
	assert.equal(frequencyMedian(entry), 7.5);
	assert.equal(formatFrequencyRank(7.5), "7.5");
	assert.equal(formatFrequencyRank(Number.MAX_SAFE_INTEGER), "—");
});
