import test from "node:test";
import assert from "node:assert/strict";
import { scoreTopikReading } from "./topik-exam.js";

test("TOPIK reading scores fifty two-point questions and excludes unanswered items", () => {
	const paper = {questions: Array.from({length: 50}, (_, number) => ({number: number + 1, answer: number % 4}))};
	const responses = paper.questions.map((question, index) => index < 20 ? question.answer : index < 30 ? (question.answer + 1) % 4 : null);
	const result = scoreTopikReading(paper, responses);
	assert.equal(result.points, 40);
	assert.equal(result.maxPoints, 100);
	assert.equal(result.answered, 30);
	assert.equal(result.correct.filter(Boolean).length, 20);
	assert.equal(result.correct[30], false);
});

test("TOPIK reading scores a selected AI part on its own scale", () => {
	const paper = {questions: [{answer: 0}, {answer: 2}, {answer: 3}]};
	const result = scoreTopikReading(paper, [0, 1, null]);
	assert.equal(result.points, 2);
	assert.equal(result.maxPoints, 6);
	assert.equal(result.answered, 2);
});
