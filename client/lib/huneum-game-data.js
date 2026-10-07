import { shuffled } from "./game-data.js";

export function huneumEntries(levels, references, ankiStatus, mode = "known") {
	const seen = new Set();
	const entries = [];
	for (const group of levels?.groups || []) {
		for (const character of group.characters) {
			const match = character.normalize("NFKC");
			const huneum = references?.[character]?.hun?.trim() || references?.[match]?.hun?.trim();
			const info = ankiStatus?.characters?.[match];
			if (!huneum || seen.has(match) || (mode === "known" && (info?.status !== "known" || info.suspended))) continue;
			seen.add(match);
			entries.push({character, huneum, level: group.level});
		}
	}
	return entries;
}

export function huneumQuestion(entry, entries, random = Math.random) {
	const labels = new Set([entry.huneum]);
	const sameLevel = entries.filter((candidate) => candidate.level === entry.level && candidate.character !== entry.character);
	const others = entries.filter((candidate) => candidate.level !== entry.level);
	for (const candidate of [...shuffled(sameLevel, random), ...shuffled(others, random)]) {
		labels.add(candidate.huneum);
		if (labels.size === 4) break;
	}
	if (labels.size < 4) return null;
	return {entry, correct: entry.huneum, choices: shuffled([...labels], random)};
}
