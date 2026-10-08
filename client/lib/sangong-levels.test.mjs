import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildLevelIndex } from "./idiom-filter.js";
import { levelFor } from "./insight-data.js";

const catalog = JSON.parse(readFileSync(new URL("../data/levels-sangong.json", import.meta.url)));

test("상공회의소 snapshot has exclusive grades through 3급 and includes the Anki variants", () => {
	assert.deepEqual(catalog.groups.map((group) => group.level), ["9급", "8급", "7급", "6급", "5급", "4급", "3급"]);
	assert.deepEqual(catalog.groups.map((group) => group.characters.length), [50, 100, 150, 151, 150, 301, 901]);
	const characters = catalog.groups.flatMap((group) => group.characters);
	assert.equal(new Set(characters).size, catalog.total);
	assert.equal(catalog.total - Object.keys(catalog.variants).length, catalog.officialTotal);
	const index = buildLevelIndex(catalog);
	for (const [variant, original] of Object.entries(catalog.variants)) {
		assert.equal(levelFor(variant, catalog), levelFor(original, catalog));
		assert.equal(index.byCharacter.get(variant), index.byCharacter.get(original));
	}
});
