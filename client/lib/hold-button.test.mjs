import test from "node:test";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { bindHoldButton } from "./hold-button.js";

class TestButton extends EventTarget {
	classes = new Set();
	classList = {add: (name) => this.classes.add(name), remove: (name) => this.classes.delete(name), contains: (name) => this.classes.has(name)};
	setPointerCapture() {}
	getBoundingClientRect() { return {left: 0, right: 100, top: 0, bottom: 40}; }
}

function dispatch(button, type, values = {}) {
	const event = new Event(type, {cancelable: true});
	Object.assign(event, values);
	button.dispatchEvent(event);
}

test("hold action cancels on a short click or early release and activates after the gauge fills", async () => {
	const button = new TestButton();
	let count = 0;
	bindHoldButton(button, () => true, () => count++, {duration: 30, blurTarget: new EventTarget()});
	dispatch(button, "click");
	dispatch(button, "pointerdown", {button: 0, pointerId: 1});
	assert.equal(button.classList.contains("is-holding"), true);
	dispatch(button, "pointerup", {pointerId: 1});
	await delay(40);
	assert.equal(count, 0);
	assert.equal(button.classList.contains("is-holding"), false);
	dispatch(button, "pointerdown", {button: 0, pointerId: 2});
	await delay(40);
	assert.equal(count, 1);
	dispatch(button, "click");
	assert.equal(count, 1);
});

test("leaving the button cancels a hold while a non-hold mode keeps normal click", async () => {
	const button = new TestButton();
	let holdRequired = true;
	let count = 0;
	bindHoldButton(button, () => holdRequired, () => count++, {duration: 30, blurTarget: new EventTarget()});
	dispatch(button, "pointerdown", {button: 0, pointerId: 1});
	dispatch(button, "pointermove", {pointerId: 1, clientX: 120, clientY: 10});
	await delay(40);
	assert.equal(count, 0);
	holdRequired = false;
	dispatch(button, "click");
	assert.equal(count, 1);
});
