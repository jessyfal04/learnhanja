import test from "node:test";
import assert from "node:assert/strict";
import { state } from "./state.js";

const nodes = new Map();
const events = [];
globalThis.document = {
	getElementById(id) {
		if (!nodes.has(id)) nodes.set(id, {value: "", disabled: false, classList: {toggle() {}}});
		return nodes.get(id);
	},
	dispatchEvent(event) { events.push(event.type); },
	createElement() {
		return {content: {textContent: ""}, set innerHTML(value) { this.content.textContent = value; }};
	},
};
const { refreshStatus, characterFieldChanged } = await import("./anki.js?v=2");
document.getElementById("deckSelect").value = "한자";
document.getElementById("noteTypeSelect").value = "Hanja";
document.getElementById("characterFieldSelect").value = "Char";

function responseFor(action, params) {
	let result;
	if (action === "modelFieldNames") result = ["Char", "Alternate"];
	if (action === "findNotes") result = /is:new|is:suspended/.test(params.query) && !params.query.includes("-is:new") ? [] : [1];
	if (action === "notesInfo") result = [{noteId: 1, fields: {Char: {value: "人"}, Alternate: {value: "山"}}}];
	return {ok: true, json: async () => ({result, error: null})};
}

function mockFetch(gate) {
	let calls = 0;
	globalThis.fetch = async (_url, options) => {
		const {action, params} = JSON.parse(options.body);
		calls++;
		if (calls === 1 && gate) await gate;
		return responseFor(action, params);
	};
}

test("concurrent refreshes share one request and record the chosen Anki source", async () => {
	let release;
	mockFetch(new Promise((resolve) => { release = resolve; }));
	const first = refreshStatus({silent: true});
	const second = refreshStatus({silent: true});
	assert.equal(first, second);
	assert.equal(state.ankiStatusLoading, true);
	release();
	assert.equal(await first, true);
	assert.equal(state.ankiStatus.characters["人"].status, "known");
	assert.equal(state.ankiStatusSource.field, "Char");
	assert.equal(state.ankiStatusLoading, false);
	assert.ok(events.includes("hanja-status-change"));
});

test("changing the configured field clears old colors and ignores late results", async () => {
	let release;
	mockFetch(new Promise((resolve) => { release = resolve; }));
	const old = refreshStatus({silent: true});
	document.getElementById("characterFieldSelect").value = "Alternate";
	characterFieldChanged();
	assert.equal(state.ankiStatus, null);
	assert.equal(await refreshStatus({silent: true}), true);
	assert.equal(state.ankiStatus.characters["山"].status, "known");
	release();
	assert.equal(await old, false);
	assert.equal(state.ankiStatusSource.field, "Alternate");
	assert.equal(state.ankiStatus.characters["人"], undefined);
});

test("a failed Anki refresh clears stale learned colors and exposes a retryable error", async () => {
	globalThis.fetch = async () => { throw new Error("offline"); };
	assert.equal(await refreshStatus({silent: true}), false);
	assert.equal(state.ankiStatus, null);
	assert.equal(state.ankiStatusSource, null);
	assert.equal(state.ankiStatusLoading, false);
	assert.match(state.ankiStatusError, /앙키/);
});
