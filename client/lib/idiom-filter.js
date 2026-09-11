export function idiomCharacters(idiom) {
	return Array.from((idiom.hanja || "").normalize("NFKC")).filter((character) => /[\u3400-\u9fff\uf900-\ufaff]/u.test(character));
}

export function filterAndSortIdioms(entries, query, selected, selectedOnly, sort) {
	const needle = String(query || "").trim().toLocaleLowerCase();
	const filtered = (entries || []).filter((entry) => {
		const matches = !needle || `${entry.korean} ${entry.hanja}`.toLocaleLowerCase().includes(needle);
		const characters = idiomCharacters(entry);
		return matches && (!selectedOnly || characters.length > 0 && characters.every((character) => selected.has(character)));
	});
	const collator = new Intl.Collator(["ko", "zh"]);
	if (sort === "korean") filtered.sort((a, b) => collator.compare(a.korean, b.korean));
	if (sort === "hanja") filtered.sort((a, b) => collator.compare(a.hanja, b.hanja));
	return filtered;
}
