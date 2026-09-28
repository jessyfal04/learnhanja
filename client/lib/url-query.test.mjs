import assert from "node:assert/strict";
import test from "node:test";
import { queryFieldID, queryFromSearch, urlWithQuery } from "./url-query.js";

test("maps q to the primary search field of each searchable view", () => {
	assert.equal(queryFieldID("vocabulary"), "vocabFilter");
	assert.equal(queryFieldID("idioms"), "idiomFilter");
	assert.equal(queryFieldID("insights"), "insightInput");
	assert.equal(queryFieldID("characters"), "");
});

test("reads q while distinguishing a missing parameter", () => {
	assert.equal(queryFromSearch("?q=%E5%AD%B8"), "學");
	assert.equal(queryFromSearch("?q="), "");
	assert.equal(queryFromSearch("?other=1"), null);
});

test("updates q without losing other parameters or the active tab", () => {
	assert.equal(urlWithQuery("https://example.test/?other=1#idioms", "四字成語"), "/?other=1&q=%E5%9B%9B%E5%AD%97%E6%88%90%E8%AA%9E#idioms");
	assert.equal(urlWithQuery("https://example.test/?other=1&q=old#vocabulary", ""), "/?other=1#vocabulary");
});
