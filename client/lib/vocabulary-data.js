import { loadStaticJSON } from "./static-data.js";

const defaultLimit = 500;
const maximumLimit = 5000;
let catalogPromise;

export function loadVocabularyCatalog() {
	catalogPromise ||= loadStaticJSON("/data/vocabulary.json").then(expandCatalog);
	return catalogPromise;
}

export function expandCatalog(rows) {
	return rows.map(([hanja, hangul, meanings, definitions, pokemonRank, niklRank]) => ({
		hanja,
		hangul,
		meanings,
		definitions,
		pokemonRank,
		niklRank,
	}));
}

export function searchVocabulary(entries, characters, limit = defaultLimit) {
	const allowed = hanjaSet(characters);
	if (!allowed.size) return {entries: [], total: 0};
	const matches = entries.filter((entry) => [...entry.hanja].every((character) => allowed.has(normalize(character))));
	sortByFrequency(matches);
	const boundedLimit = Math.min(Math.max(Number(limit) || defaultLimit, 1), maximumLimit);
	return {entries: matches.slice(0, boundedLimit), total: matches.length};
}

export function relatedVocabulary(entries, characters) {
	const wanted = hanjaSet(characters);
	if (!wanted.size) return [];
	const matches = entries.filter((entry) => [...entry.hanja].some((character) => wanted.has(normalize(character))));
	return sortByFrequency(matches);
}

function hanjaSet(values) {
	return new Set((values || []).flatMap((value) => [...normalize(value)]).filter((character) => /^\p{Script=Han}$/u.test(character)));
}

function normalize(value) {
	return String(value || "").trim().normalize("NFKC");
}

function sortByFrequency(entries) {
	return entries.sort((left, right) => bestRank(left) - bestRank(right) || left.hangul.localeCompare(right.hangul, "ko") || left.hanja.localeCompare(right.hanja));
}

function bestRank(entry) {
	const ranks = [entry.pokemonRank, entry.niklRank].filter((rank) => rank > 0);
	return ranks.length ? Math.min(...ranks) : Number.MAX_SAFE_INTEGER;
}
