export function idiomCharacters(idiom) {
	return Array.from((idiom.hanja || "").normalize("NFKC")).filter((character) => /[\u3400-\u9fff\uf900-\ufaff]/u.test(character));
}

export function idiomStatusInfo(idiom, statuses) {
	if (!statuses) return null;
	return statuses[String(idiom.hanja || "").normalize("NFKC")] || statuses[String(idiom.korean || "").normalize("NFKC")] || null;
}

export function filterAndSortIdioms(entries, query, selected, selectedOnly, sort, source = "all") {
	const needle = String(query || "").normalize("NFKC").trim().toLocaleLowerCase();
	const filtered = (entries || []).filter((entry) => {
		const haystack = `${entry.korean} ${entry.hanja}`.normalize("NFKC").toLocaleLowerCase();
		const matches = !needle || haystack.includes(needle);
		const characters = idiomCharacters(entry);
		const matchesSource = source === "all" || (entry.sources || []).includes(source);
		return matches && matchesSource && (!selectedOnly || characters.length > 0 && characters.every((character) => selected.has(character)));
	});
	const collator = new Intl.Collator(["ko", "zh"]);
	if (sort === "korean") filtered.sort((a, b) => collator.compare(a.korean, b.korean));
	if (sort === "hanja") filtered.sort((a, b) => collator.compare(a.hanja, b.hanja));
	if (sort === "page") filtered.sort((a, b) => (a.page || Number.MAX_SAFE_INTEGER) - (b.page || Number.MAX_SAFE_INTEGER) || collator.compare(a.korean, b.korean));
	if (sort === "source") filtered.sort((a, b) => sourceOrder(a, source) - sourceOrder(b, source));
	return filtered;
}

function sourceOrder(entry, source) {
	if (source !== "all") return entry.sourceOrders?.[source] ?? Number.MAX_SAFE_INTEGER;
	if (entry.sourceOrders?.exam) return entry.sourceOrders.exam;
	return 100000 + (entry.sourceOrders?.nikl ?? Number.MAX_SAFE_INTEGER - 100000);
}
