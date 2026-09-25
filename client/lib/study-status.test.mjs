import assert from "node:assert/strict";
import test from "node:test";

import { isActiveStudyStatus, studyStatusKey, studyStatusPresentation } from "./study-status.js";

test("maps active and suspended study states to shared Bulma presentations", () => {
	assert.deepEqual(studyStatusPresentation({status: "known"}), {key: "known-active", label: "학습함", classes: "is-link is-light"});
	assert.deepEqual(studyStatusPresentation({status: "new"}), {key: "new-active", label: "새 카드", classes: "is-warning"});
	assert.deepEqual(studyStatusPresentation({status: "known", suspended: true}), {key: "known-suspended", label: "학습함 · 일시 중단", classes: "is-dark"});
	assert.deepEqual(studyStatusPresentation({status: "new", suspended: true}), {key: "new-suspended", label: "새 카드 · 일시 중단", classes: "is-danger is-light"});
	assert.equal(studyStatusKey(null), "unknown");
	assert.equal(studyStatusKey(null, {absent: true}), "absent");
	assert.equal(studyStatusKey(null, {unverified: true}), "unverified");
});

test("active selection excludes suspended learned and new cards", () => {
	assert.equal(isActiveStudyStatus({status: "known"}, "known"), true);
	assert.equal(isActiveStudyStatus({status: "known", suspended: true}, "known"), false);
	assert.equal(isActiveStudyStatus({status: "new", suspended: true}, "new"), false);
});
