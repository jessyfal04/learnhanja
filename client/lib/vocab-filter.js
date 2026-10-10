import { frequencyMean } from "./frequency.js";

function rank(entry) {
	return frequencyMean(entry);
}

export function vocabularyKnowledge(entry, knownWords, markedWords, ankiStatus) {
	if (!(knownWords instanceof Set)) return "unverified";
	const hangul = String(entry.hangul || "").normalize("NFC");
	if (markedWords instanceof Set && markedWords.has(hangul)) return "marked";
	if (knownWords.has(hangul)) return "known";
	const characters = Array.from(new Set(Array.from(String(entry.hanja || "").normalize("NFKC")).filter((character) => /[\u3400-\u9fff\uf900-\ufaff]/u.test(character))));
	const learned = characters.length > 0 && characters.every((character) => {
		const info = ankiStatus?.characters?.[character];
		return info?.status === "known" && !info.suspended;
	});
	return learned ? "target" : "unknown";
}

export function countSleepingVocabulary(entries, knownWords, markedWords, ankiStatus) {
	return (entries || []).reduce((count, entry) => count + (vocabularyKnowledge(entry, knownWords, markedWords, ankiStatus) === "target"), 0);
}

export function filterAndSortVocabulary(entries, query, maxRank, sort, knowledge = {}, statusFilter = "all") {
	const needle = String(query || "").trim().toLocaleLowerCase();
	const maximum = Number(maxRank) > 0 ? Number(maxRank) : Number.MAX_SAFE_INTEGER;
	const result = (entries || []).filter((entry) => {
		const text = [entry.hanja, entry.hangul, ...(entry.meanings || [])].join(" ").toLocaleLowerCase();
		const status = vocabularyKnowledge(entry, knowledge.knownWords, knowledge.markedWords, knowledge.ankiStatus);
		const statusMatches = statusFilter === "all" || statusFilter === "known" && status === "known" || statusFilter === "unknown" && (status === "unknown" || status === "target" || status === "marked");
		return (!needle || text.includes(needle)) && rank(entry) <= maximum && statusMatches;
	});
	const collator = new Intl.Collator(["ko", "en"]);
	result.sort((a, b) => {
		if (sort === "unknown-known-hanja") {
			const priority = {target: 0, marked: 1, unknown: 2, known: 3, unverified: 4};
			const difference = priority[vocabularyKnowledge(a, knowledge.knownWords, knowledge.markedWords, knowledge.ankiStatus)] - priority[vocabularyKnowledge(b, knowledge.knownWords, knowledge.markedWords, knowledge.ankiStatus)];
			if (difference) return difference;
			return rank(a) - rank(b) || collator.compare(a.hangul, b.hangul);
		}
		if (sort === "hanja-asc") return collator.compare(a.hanja, b.hanja);
		if (sort === "hanja-desc") return collator.compare(b.hanja, a.hanja);
		if (sort === "hangul-asc") return collator.compare(a.hangul, b.hangul);
		if (sort === "english-asc") return collator.compare((a.meanings || []).join(" "), (b.meanings || []).join(" "));
		return rank(a) - rank(b) || collator.compare(a.hangul, b.hangul);
	});
	return result;
}
