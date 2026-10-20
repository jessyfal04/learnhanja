import {addReadingExposure, entryHanja, entryKey, usableGameEntry} from "./game-data.js";
import {frequencyMean} from "./frequency.js";

const hangul = (value) => String(value || "").normalize("NFC");
const particles = /^(?:은|는|이|가|을|를|에|의|와|과|도|만|로|으로|에서|에게|까지|부터|보다|처럼|마다|이나|나|이며|이고|이라|이라고|이다|입니다|였다|였다가|였다면|였다며|였다지만|이었다|이었다고|이었다면|이었고|이었는데|이었다는|이어서|이라서|이라고는|이라며|이라는|에는|에도|에서는|에서도|에게는|에게도|까지는|부터는|보다도|조차|마저)?$/u;
const wordRun = /[가-힣]+/gu;

export function uniqueReadings(catalog) {
	const grouped = new Map();
	for (const entry of catalog || []) {
		if (!usableGameEntry(entry, {requireDefinition: true})) continue;
		const key = hangul(entry.hangul);
		if (!/^[가-힣]{2,4}$/u.test(key) || /(?:하다|되다)$/u.test(key)) continue;
		if (!grouped.has(key)) grouped.set(key, []);
		grouped.get(key).push(entry);
	}
	return new Map([...grouped].filter(([key, entries]) =>
		new Set(entries.map((entry) => entry.hanja.normalize("NFKC"))).size === 1 &&
		// Combined variant spellings still make a reading ambiguous
		/^\p{Script=Han}{2,4}$/u.test(entries[0].hanja) && [...key].length === [...entries[0].hanja].length
	).map(([key, entries]) => [key, entries[0]]));
}

export function convertKorean(text, catalog, allowed = null) {
	const original = String(text || "");
	const readings = uniqueReadings(catalog);
	const segments = [];
	let cursor = 0;
	for (const match of original.matchAll(wordRun)) {
		const start = match.index;
		if (start > cursor) segments.push({text: original.slice(cursor, start), hanja: ""});
		const token = match[0];
		let entry = null;
		for (let length = token.length; length >= 1; length--) {
			const prefix = token.slice(0, length);
			if (!readings.has(prefix) || !particles.test(token.slice(length))) continue;
			const candidate = readings.get(prefix);
			if (allowed && !entryHanja(candidate).every((character) => allowed.has(character))) continue;
			entry = candidate;
			break;
		}
		if (entry) {
			segments.push({text: entry.hangul, hanja: entry.hanja});
			if (token.length > entry.hangul.length) segments.push({text: token.slice(entry.hangul.length), hanja: ""});
		} else segments.push({text: token, hanja: ""});
		cursor = start + token.length;
	}
	if (cursor < original.length) segments.push({text: original.slice(cursor), hanja: ""});
	return segments;
}

export function passageText(segments, mode = "hangul") {
	return (segments || []).map((part) => mode === "hangul" ? part.text : part.hanja || part.text).join("");
}

export function selectCharacters(source, {status, failed = new Set(), selected = new Set(), syllabus = new Set(), exposures = {}, limit = 8} = {}) {
	let candidates;
	if (source === "failed") candidates = [...failed];
	else if (source === "selected") candidates = [...selected];
	else if (source === "syllabus") candidates = [...syllabus];
	else candidates = Object.entries(status?.characters || {}).filter(([, info]) => info.status === "known" && !info.suspended).map(([character]) => character);
	const unique = [...new Set(candidates.map((character) => character.normalize("NFKC")))].filter((character) => /^\p{Script=Han}$/u.test(character));
	unique.sort((a, b) => Number(!failed.has(a)) - Number(!failed.has(b)) || (exposures[a] || 0) - (exposures[b] || 0) || a.localeCompare(b));
	return unique.slice(0, Math.max(1, Math.min(10, limit)));
}

export function selectReaderWords(catalog, characters, {knownWords = new Set(), markedWords = new Set(), exposures = {}, recentWords = [], limit = 24} = {}) {
	const targets = new Set(characters);
	const recent = new Set(recentWords);
	const unique = uniqueReadings(catalog);
	const ranked = [...unique.values()].filter((entry) => entryHanja(entry).some((character) => targets.has(character)))
		.sort((a, b) => {
			const score = (entry) => {
				const chars = entryHanja(entry);
				return Number(recent.has(entryKey(entry))) * 100000 + chars.reduce((sum, character) => sum + (exposures[character] || 0) * 200, 0) / chars.length + frequencyMean(entry) / 10 - Number(knownWords.has(hangul(entry.hangul))) * 500 - Number(markedWords.has(hangul(entry.hangul))) * 150;
			};
			return score(a) - score(b) || a.hangul.localeCompare(b.hangul, "ko");
		});
	const chosen = [];
	const used = new Set();
	for (let round = 0; round < 2; round++) {
		for (const character of characters) {
			if (chosen.length >= Math.max(1, Math.min(40, limit))) break;
			const next = ranked.find((entry) => !used.has(entryKey(entry)) && entryHanja(entry).includes(character));
			if (next) { chosen.push(next); used.add(entryKey(next)); }
		}
	}
	for (const entry of ranked) {
		if (chosen.length >= Math.max(1, Math.min(40, limit))) break;
		if (!used.has(entryKey(entry))) { chosen.push(entry); used.add(entryKey(entry)); }
	}
	return chosen;
}

export function loadReaderExposure(storage = localStorage) {
	try {
		const value = JSON.parse(storage.getItem("learnhanja-reader-exposure-v1") || "{}");
		return {characters: value.characters || {}, words: value.words || {}, revealed: value.revealed || {}, missed: value.missed || {}, sessions: value.sessions || 0, recentWords: value.recentWords || []};
	} catch { return {characters: {}, words: {}, revealed: {}, missed: {}, sessions: 0, recentWords: []}; }
}

export function recordReaderSession(stats, segments, {revealed = new Set(), missed = new Set()} = {}) {
	const next = structuredClone(stats);
	const characters = new Set();
	const words = new Set();
	for (const part of segments) {
		if (!part.hanja) continue;
		const key = `${part.text}\u0000${part.hanja}`;
		words.add(key);
		addReadingExposure(next, {hangul: part.text, hanja: part.hanja});
		for (const character of entryHanja(part)) {
			characters.add(character);
		}
	}
	for (const character of revealed) next.revealed[character] = (next.revealed[character] || 0) + 1;
	for (const character of missed) next.missed[character] = (next.missed[character] || 0) + 1;
	next.sessions++;
	next.recentWords = [...words, ...next.recentWords].slice(0, 120);
	return {stats: next, characters, words};
}

export function saveReaderExposure(stats, storage = localStorage) {
	storage.setItem("learnhanja-reader-exposure-v1", JSON.stringify(stats));
}
