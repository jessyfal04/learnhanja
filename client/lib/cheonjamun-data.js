import { isActiveStudyStatus } from "./study-status.js?v=2";

const normalize = (value) => String(value || "").normalize("NFKC");

export function sentenceTokens(sentence) {
	return sentence.phrases.flat();
}

export function normalizedSet(values) {
	return new Set(Array.from(values || [], normalize));
}

export function statusIndex(statuses) {
	return new Map(Object.entries(statuses?.characters || {}).map(([character, info]) => [normalize(character), info]));
}

export function statusForToken(token, statuses) {
	const lookup = statuses instanceof Map ? statuses : statusIndex(statuses);
	return lookup.get(normalize(token.match)) || lookup.get(normalize(token.display));
}

export function sentenceProgress(sentence, {statuses, selected, catalog} = {}) {
	const tokens = sentenceTokens(sentence);
	const statusesByCharacter = statuses instanceof Map ? statuses : statusIndex(statuses);
	const selectedCharacters = normalizedSet(selected);
	const catalogCharacters = normalizedSet(catalog);
	let known = 0;
	let chosen = 0;
	let cataloged = 0;
	for (const token of tokens) {
		const match = normalize(token.match);
		const info = statusesByCharacter.get(match) || statusesByCharacter.get(normalize(token.display));
		if (isActiveStudyStatus(info, "known")) known++;
		if (selectedCharacters.has(match)) chosen++;
		if (catalogCharacters.has(match)) cataloged++;
	}
	return {known, selected: chosen, cataloged, total: tokens.length, verified: Boolean(statuses)};
}

export function filterAndSortSentences(sentences, {filter = "all", sort = "original", statuses, selected, catalog} = {}) {
	const lookup = statuses ? statusIndex(statuses) : null;
	const rows = sentences.map((sentence) => ({sentence, progress: sentenceProgress(sentence, {statuses: lookup, selected, catalog})}));
	const visible = rows.filter(({progress}) => {
		if (filter === "complete") return progress.verified && progress.known === progress.total;
		if (filter === "incomplete") return !progress.verified || progress.known < progress.total;
		if (filter === "selected") return progress.selected > 0;
		return true;
	});
	if (sort === "frontier" && lookup) {
		visible.sort((a, b) => {
			const aComplete = a.progress.known === a.progress.total;
			const bComplete = b.progress.known === b.progress.total;
			if (aComplete !== bComplete) return aComplete ? 1 : -1;
			return (b.progress.known - a.progress.known) || (a.sentence.number - b.sentence.number);
		});
	}
	return visible;
}
