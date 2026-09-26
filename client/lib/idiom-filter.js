export function idiomCharacters(idiom) {
	return Array.from((idiom.hanja || "").normalize("NFKC")).filter((character) => /[\u3400-\u9fff\uf900-\ufaff]/u.test(character));
}

export function idiomStatusInfo(idiom, statuses) {
	if (!statuses) return null;
	return statuses[String(idiom.hanja || "").normalize("NFKC")] || statuses[String(idiom.korean || "").normalize("NFKC")] || null;
}

export function buildLevelIndex(catalog) {
	const byCharacter = new Map();
	const levels = (catalog?.groups || []).map((group, index) => {
		for (const character of group.characters) byCharacter.set(character.normalize("NFKC"), index);
		return group.level;
	});
	return {byCharacter, levels};
}

export function idiomLevel(idiom, levelIndex) {
	if (!levelIndex || idiom.partial || /[-/]/u.test(idiom.hanja || "")) return "unknown";
	const characters = idiomCharacters(idiom);
	if (!characters.length) return "unknown";
	let hardest = -1;
	for (const character of characters) {
		const index = levelIndex.byCharacter.get(character);
		if (index === undefined) return "unknown";
		hardest = Math.max(hardest, index);
	}
	return levelIndex.levels[hardest] || "unknown";
}

export function filterAndSortIdioms(entries, query, selected, selectedOnly, sort, source = "all", level = "all", levelIndex = null) {
	const needle = String(query || "").normalize("NFKC").trim().toLocaleLowerCase();
	const filtered = (entries || []).filter((entry) => {
		const haystack = `${entry.korean} ${entry.hanja}`.normalize("NFKC").toLocaleLowerCase();
		const matches = !needle || haystack.includes(needle);
		const characters = idiomCharacters(entry);
		const matchesSource = source === "all" || (entry.sources || []).includes(source);
		const entryLevel = idiomLevel(entry, levelIndex);
		const chosenLevelIndex = levelIndex?.levels.indexOf(level) ?? -1;
		const entryLevelIndex = levelIndex?.levels.indexOf(entryLevel) ?? -1;
		const matchesLevel = level === "all" || entryLevel === level || chosenLevelIndex >= 0 && entryLevelIndex >= 0 && entryLevelIndex <= chosenLevelIndex;
		return matches && matchesSource && matchesLevel && (!selectedOnly || characters.length > 0 && characters.every((character) => selected.has(character)));
	});
	const collator = new Intl.Collator(["ko", "zh"]);
	if (sort === "korean") filtered.sort((a, b) => collator.compare(a.korean, b.korean));
	if (sort === "hanja") filtered.sort((a, b) => collator.compare(a.hanja, b.hanja));
	if (sort === "source") filtered.sort((a, b) => sourceOrder(a, source) - sourceOrder(b, source));
	return filtered;
}

function sourceOrder(entry, source) {
	if (source !== "all") return entry.sourceOrders?.[source] ?? Number.MAX_SAFE_INTEGER;
	if (entry.sourceOrders?.exam) return entry.sourceOrders.exam;
	if (entry.sourceOrders?.nikl) return 100000 + entry.sourceOrders.nikl;
	if (entry.sourceOrders?.master_6) return 200000 + entry.sourceOrders.master_6;
	if (entry.sourceOrders?.onebook_6) return 300000 + entry.sourceOrders.onebook_6;
	return Number.MAX_SAFE_INTEGER;
}
