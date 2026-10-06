import { frequencyMean } from "./frequency.js";

const hanPattern = /^\p{Script=Han}$/u;

const normalizeHangul = (value) => String(value || "").normalize("NFC").trim();
const normalizeHanja = (value) => String(value || "").normalize("NFKC").trim();

export function entryKey(entry) {
	return `${normalizeHangul(entry?.hangul)}\u0000${normalizeHanja(entry?.hanja)}`;
}

export function entryHanja(entry) {
	return Array.from(new Set(Array.from(normalizeHanja(entry?.hanja)).filter((character) => hanPattern.test(character))));
}

export function allHanjaKnown(entry, ankiStatus) {
	const characters = entryHanja(entry);
	return characters.length > 0 && characters.every((character) => {
		const info = ankiStatus?.characters?.[character];
		return info?.status === "known" && !info.suspended;
	});
}

export function usableGameEntry(entry, {requireDefinition = false} = {}) {
	const hangul = normalizeHangul(entry?.hangul);
	if (!hangul || hangul.startsWith("-") || hangul.endsWith("-") || /\s/u.test(hangul)) return false;
	if (!entryHanja(entry).length) return false;
	return !requireDefinition || (entry.definitions || []).some((definition) => String(definition).trim());
}

export function knownGameEntries(catalog, knownWords, ankiStatus, options = {}) {
	return gameEntries(catalog, knownWords, ankiStatus, {...options, wordMode: "known", hanjaMode: "known"});
}

export function unknownGameEntries(catalog, knownWords, markedWords, ankiStatus, options = {}) {
	const marked = normalizedWords(markedWords);
	return gameEntries(catalog, knownWords, ankiStatus, {...options, wordMode: "unknown", hanjaMode: "known"})
		.sort((left, right) => Number(!marked.has(normalizeHangul(left.hangul))) - Number(!marked.has(normalizeHangul(right.hangul))) || candidateScore(left) - candidateScore(right) || normalizeHangul(left.hangul).localeCompare(normalizeHangul(right.hangul), "ko"));
}

export function gameEntries(catalog, knownWords, ankiStatus, {wordMode = "known", hanjaMode = "known", requireDefinition = false} = {}) {
	const known = normalizedWords(knownWords);
	return (catalog || []).filter((entry) => {
		if (!usableGameEntry(entry, {requireDefinition})) return false;
		const wordKnown = known.has(normalizeHangul(entry.hangul));
		if (wordMode === "known" && !wordKnown) return false;
		if (wordMode === "unknown" && wordKnown) return false;
		return hanjaMode !== "known" || allHanjaKnown(entry, ankiStatus);
	});
}

export function wordIsKnown(entry, knownWords) {
	return normalizedWords(knownWords).has(normalizeHangul(entry?.hangul));
}

export function rankGameEntries(entries, {exposures = {}, previousEntries = [], markedWords = new Set()} = {}) {
	const previous = new Set(Array.from(previousEntries || [], (entry) => typeof entry === "string" ? entry : entryKey(entry)));
	const marked = normalizedWords(markedWords);
	return [...(entries || [])].sort((left, right) => {
		const previousDifference = Number(previous.has(entryKey(left))) - Number(previous.has(entryKey(right)));
		if (previousDifference) return previousDifference;
		const markedDifference = Number(!marked.has(normalizeHangul(left.hangul))) - Number(!marked.has(normalizeHangul(right.hangul)));
		if (markedDifference) return markedDifference;
		return balancedScore(left, exposures) - balancedScore(right, exposures) || candidateScore(left) - candidateScore(right);
	});
}

export function randomizedGameEntries(entries, {desired = 4, random = Math.random, candidateWindow = 500, ...ranking} = {}) {
	const ranked = rankGameEntries(entries, ranking);
	const previous = new Set(Array.from(ranking.previousEntries || [], (entry) => typeof entry === "string" ? entry : entryKey(entry)));
	const fresh = ranked.filter((entry) => !previous.has(entryKey(entry)));
	const recent = ranked.filter((entry) => previous.has(entryKey(entry)));
	const windowSize = Math.min(fresh.length, Math.max(Number(candidateWindow) || 500, (Number(desired) || 4) * 50));
	return [...shuffled(fresh.slice(0, windowSize), random), ...shuffled(fresh.slice(windowSize), random), ...shuffled(recent, random)];
}

export function buildMatchRound(entries, size = 4, previousEntries = [], {exposures = {}, markedWords = new Set(), preserveOrder = false} = {}) {
	const wanted = Math.max(1, Math.min(Number(size) || 4, 6));
	const chosen = [];
	const hangul = new Set();
	const hanja = new Set();
	const candidates = preserveOrder ? entries || [] : rankGameEntries(entries, {exposures, previousEntries, markedWords});
	for (const entry of candidates) {
		const word = normalizeHangul(entry.hangul);
		const spelling = normalizeHanja(entry.hanja);
		if (hangul.has(word) || hanja.has(spelling)) continue;
		chosen.push(entry);
		hangul.add(word);
		hanja.add(spelling);
		if (chosen.length === wanted) break;
	}
	return chosen;
}

export function buildBalancedMatchRound(knownEntries, unknownEntries, size = 4, previousEntries = [], {exposures = {}, markedWords = new Set(), preserveOrder = false} = {}) {
	const wanted = Math.max(1, Math.min(Number(size) || 4, 6));
	const known = preserveOrder ? knownEntries || [] : rankGameEntries(knownEntries, {exposures, previousEntries});
	const unknown = preserveOrder ? unknownEntries || [] : rankGameEntries(unknownEntries, {exposures, previousEntries, markedWords});
	const chosen = [];
	const hangul = new Set();
	const hanja = new Set();
	const addFrom = (entries, limit) => {
		let added = 0;
		for (const entry of entries) {
			const word = normalizeHangul(entry.hangul);
			const spelling = normalizeHanja(entry.hanja);
			if (hangul.has(word) || hanja.has(spelling)) continue;
			chosen.push(entry);
			hangul.add(word);
			hanja.add(spelling);
			added++;
			if (added === limit) break;
		}
	};
	addFrom(known, Math.ceil(wanted / 2));
	addFrom(unknown, Math.floor(wanted / 2));
	if (chosen.length < wanted) addFrom(interleave(known, unknown), wanted - chosen.length);
	return chosen;
}

export function buildMixedQuestion(entry, catalog, {choiceCount = 4, ankiStatus = null, random = Math.random} = {}) {
	const correct = normalizeHanja(entry?.hanja);
	const targetLength = Array.from(correct).length;
	const targetCharacters = new Set(entryHanja(entry));
	const candidates = (catalog || []).filter((candidate) => {
		const hanja = normalizeHanja(candidate.hanja);
		return hanja && hanja !== correct && usableGameEntry(candidate) && (!ankiStatus || allHanjaKnown(candidate, ankiStatus));
	});
	candidates.sort((left, right) => distractorScore(left, entry, targetCharacters, targetLength) - distractorScore(right, entry, targetCharacters, targetLength) || candidateScore(left) - candidateScore(right));
	const choices = [correct];
	const collision = candidates.filter((candidate) => normalizeHangul(candidate.hangul) === normalizeHangul(entry.hangul));
	const plausible = candidates.filter((candidate) => !collision.includes(candidate));
	const varied = [...collision, ...shuffled(plausible.slice(0, 24), random), ...plausible.slice(24)];
	for (const candidate of varied) {
		const hanja = normalizeHanja(candidate.hanja);
		if (!choices.includes(hanja)) choices.push(hanja);
		if (choices.length >= Math.max(3, Math.min(Number(choiceCount) || 4, 5))) break;
	}
	return {entry, correct, choices, definition: firstDefinition(entry)};
}

export function shuffled(values, random = Math.random) {
	const result = [...values];
	for (let index = result.length - 1; index > 0; index--) {
		const target = Math.floor(random() * (index + 1));
		[result[index], result[target]] = [result[target], result[index]];
	}
	return result;
}

export function addExposure(exposures, entry) {
	for (const character of entryHanja(entry)) exposures[character] = (exposures[character] || 0) + 1;
	return exposures;
}

function normalizedWords(words) {
	return new Set(Array.from(words || [], normalizeHangul));
}

function firstDefinition(entry) {
	return (entry?.definitions || []).map((definition) => String(definition).trim()).find(Boolean) || "";
}

function candidateScore(entry) {
	const frequency = frequencyMean(entry);
	const lengthPenalty = Math.max(0, Array.from(normalizeHangul(entry.hangul)).length - 2) * 250;
	return frequency + lengthPenalty;
}

function balancedScore(entry, exposures) {
	const characters = entryHanja(entry);
	const averageExposure = characters.reduce((sum, character) => sum + Number(exposures?.[character] || 0), 0) / Math.max(characters.length, 1);
	return candidateScore(entry) + averageExposure * 200;
}

function distractorScore(candidate, target, targetCharacters, targetLength) {
	const sameHangul = normalizeHangul(candidate.hangul) === normalizeHangul(target.hangul) ? 0 : 1;
	const characters = entryHanja(candidate);
	const shared = characters.filter((character) => targetCharacters.has(character)).length;
	const sameLength = Array.from(normalizeHanja(candidate.hanja)).length === targetLength ? 0 : 1;
	return sameHangul * 1000 + sameLength * 100 - shared * 10;
}

function interleave(left, right) {
	const result = [];
	for (let index = 0; index < Math.max(left.length, right.length); index++) {
		if (left[index]) result.push(left[index]);
		if (right[index]) result.push(right[index]);
	}
	return result;
}
