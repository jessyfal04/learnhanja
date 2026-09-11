function rank(entry) {
	const values = [entry.pokemonRank, entry.niklRank].filter((value) => Number(value) > 0);
	return values.length ? Math.min(...values) : Number.MAX_SAFE_INTEGER;
}

export function filterAndSortVocabulary(entries, query, maxRank, sort) {
	const needle = String(query || "").trim().toLocaleLowerCase();
	const maximum = Number(maxRank) > 0 ? Number(maxRank) : Number.MAX_SAFE_INTEGER;
	const result = (entries || []).filter((entry) => {
		const text = [entry.hanja, entry.hangul, ...(entry.meanings || [])].join(" ").toLocaleLowerCase();
		return (!needle || text.includes(needle)) && rank(entry) <= maximum;
	});
	const collator = new Intl.Collator(["ko", "en"]);
	result.sort((a, b) => {
		if (sort === "hanja-asc") return collator.compare(a.hanja, b.hanja);
		if (sort === "hanja-desc") return collator.compare(b.hanja, a.hanja);
		if (sort === "hangul-asc") return collator.compare(a.hangul, b.hangul);
		if (sort === "english-asc") return collator.compare((a.meanings || []).join(" "), (b.meanings || []).join(" "));
		return rank(a) - rank(b) || collator.compare(a.hangul, b.hangul);
	});
	return result;
}
