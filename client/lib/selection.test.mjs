import test from "node:test";
import assert from "node:assert/strict";

import { selectedByStatus, toggledSelection, withLevelSelection } from "./selection.js";

test("toggledSelection is immutable", () => {
	const original = new Set(["人"]);
	const next = toggledSelection(original, "日");
	assert.deepEqual([...original], ["人"]);
	assert.deepEqual([...next], ["人", "日"]);
	assert.deepEqual([...toggledSelection(next, "人")], ["日"]);
});

test("selectedByStatus collects matching characters", () => {
	const groups = [{ characters: [
		{ value: "人", status: "known" },
		{ value: "日", status: "new" },
	] }];
	assert.deepEqual([...selectedByStatus(groups, "known")], ["人"]);
});

test("withLevelSelection adds and removes a level", () => {
	const characters = [{ value: "人" }, { value: "日" }];
	const selected = withLevelSelection(new Set(["月"]), characters, true);
	assert.deepEqual([...selected], ["月", "人", "日"]);
	assert.deepEqual([...withLevelSelection(selected, characters, false)], ["月"]);
});
