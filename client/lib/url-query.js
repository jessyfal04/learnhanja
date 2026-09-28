const queryFields = {
	vocabulary: "vocabFilter",
	idioms: "idiomFilter",
	insights: "insightInput",
};

export function queryFieldID(view) {
	return queryFields[view] || "";
}

export function queryFromSearch(search) {
	const parameters = new URLSearchParams(search);
	return parameters.has("q") ? parameters.get("q") : null;
}

export function urlWithQuery(href, query) {
	const url = new URL(href);
	if (query) url.searchParams.set("q", query);
	else url.searchParams.delete("q");
	return `${url.pathname}${url.search}${url.hash}`;
}
