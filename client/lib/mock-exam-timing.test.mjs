import test from "node:test";
import assert from "node:assert/strict";
import { pauseQuestionTime, timeByType, trackQuestionTime } from "./mock-exam-timing.js";

test("question time follows navigation, revisits and generation pauses", () => {
	const session = {index: 0, questionTimeMs: [0, 0, 0], timingIndex: null, timingStartedAt: null};
	trackQuestionTime(session, 0);
	session.index = 1;
	trackQuestionTime(session, 1200);
	pauseQuestionTime(session, 2700);
	trackQuestionTime(session, 5000);
	session.index = 0;
	trackQuestionTime(session, 5500);
	pauseQuestionTime(session, 6300);
	assert.deepEqual(session.questionTimeMs, [2000, 2000, 0]);
	assert.equal(session.timingIndex, null);
	assert.deepEqual(timeByType([
		{type: "sound", title: "음"},
		{type: "meaning", title: "뜻"},
		{type: "sound", title: "음"},
	], session.questionTimeMs), [
		{type: "sound", title: "음", count: 2, milliseconds: 2000},
		{type: "meaning", title: "뜻", count: 1, milliseconds: 2000},
	]);
});
