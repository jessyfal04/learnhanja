import test from "node:test";
import assert from "node:assert/strict";

import { selectedByStatus, selectedFromAnki, toggledSelection, withLevelSelection } from "./selection.js";

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

test("automatic Anki selection includes only learned catalog characters", () => {
	const catalog = {groups: [{characters: ["人", "金", "日", "月"]}]};
	const statuses = {characters: {人: {status: "known"}, 金: {status: "known"}, 日: {status: "new"}, 山: {status: "known"}}};
	assert.deepEqual([...selectedFromAnki(catalog, statuses)], ["人", "金"]);
});

test("withLevelSelection adds and removes a level", () => {
	const characters = [{ value: "人" }, { value: "日" }];
	const selected = withLevelSelection(new Set(["月"]), characters, true);
	assert.deepEqual([...selected], ["月", "人", "日"]);
	assert.deepEqual([...withLevelSelection(selected, characters, false)], ["月"]);
});
