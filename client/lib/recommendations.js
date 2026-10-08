const normalizeHanja = (value) => String(value || "").normalize("NFKC");
const normalizeHangul = (value) => String(value || "").trim().normalize("NFC");

export function competitionRanks(values, higherBetter = false) {
	const indexed = values.map((value, index) => ({value, index}));
	indexed.sort((left, right) => (higherBetter ? right.value - left.value : left.value - right.value) || left.index - right.index);
	const ranks = Array(values.length);
	let previous;
	let rank = 0;
	for (let index = 0; index < indexed.length; index++) {
		if (index === 0 || indexed[index].value !== previous) rank = index + 1;
		previous = indexed[index].value;
		ranks[indexed[index].index] = rank;
	}
	return ranks;
}

export function levelCatalog(catalog) {
	const characters = new Map();
	let order = 0;
	for (const [levelIndex, group] of (catalog?.groups || []).entries()) {
		for (const value of group.characters || []) {
			const character = normalizeHanja(value);
			if (!characters.has(character)) characters.set(character, {level: group.level, levelIndex, order});
			order++;
		}
	}
	return {characters, outsideLevelIndex: catalog?.groups?.length || 0};
}

export function rankChapters({ankiStatus, knownWords, vocabulary, catalog}) {
	const levels = levelCatalog(catalog);
	const statusCharacters = new Map(Object.entries(ankiStatus?.characters || {}).map(([character, info]) => [normalizeHanja(character), info]));
	const currentKnown = new Set([...statusCharacters].filter(([, info]) => info.status === "known" && !info.suspended).map(([character]) => character));
	const normalizedKnownWords = new Set([...(knownWords || [])].map(normalizeHangul));
	const candidates = [];

	for (const source of ankiStatus?.chapters || []) {
		const characters = [...new Set((source.characters || []).map(normalizeHanja).filter(Boolean))];
		const missingCharacters = characters.filter((character) => {
			const info = statusCharacters.get(character);
			return info?.status !== "known" || info.suspended;
		});
		if (!missingCharacters.length) continue;
		const prospectiveKnown = new Set([...currentKnown, ...characters]);
		const unlockedByHangul = new Map();
		for (const entry of vocabulary || []) {
			const hangul = normalizeHangul(entry.hangul);
			if (!hangul || !normalizedKnownWords.has(hangul)) continue;
			const hanja = normalizeHanja(entry.hanja).trim();
			const wordCharacters = [...hanja];
			if (!wordCharacters.length || wordCharacters.every((character) => currentKnown.has(character))) continue;
			if (!wordCharacters.every((character) => prospectiveKnown.has(character))) continue;
			if (!unlockedByHangul.has(hangul)) unlockedByHangul.set(hangul, new Set());
			unlockedByHangul.get(hangul).add(hanja);
		}
		const unlockedWords = [...unlockedByHangul].map(([hangul, spellings]) => ({
			hangul,
			hanja: [...spellings][0],
			hanjaSpellings: [...spellings],
		})).sort((left, right) => left.hangul.localeCompare(right.hangul, "ko"));
		const levelFitValue = missingCharacters.reduce((total, character) => total + (levels.characters.get(character)?.levelIndex ?? levels.outsideLevelIndex), 0) / missingCharacters.length;
		candidates.push({
			chapter: Number(source.chapter),
			characters,
			missingCharacters,
			missingCount: missingCharacters.length,
			vocabUnlockCount: unlockedWords.length,
			levelFitValue,
			unlockedWords,
		});
	}

	const criteria = [
		["missingCount", "completionRank", false],
		["vocabUnlockCount", "vocabUnlockRank", true],
		["levelFitValue", "levelFitRank", false],
		["chapter", "bookOrderRank", false],
	];
	for (const [valueKey, rankKey, higherBetter] of criteria) {
		const ranks = competitionRanks(candidates.map((candidate) => candidate[valueKey]), higherBetter);
		candidates.forEach((candidate, index) => { candidate[rankKey] = ranks[index]; });
	}
	for (const candidate of candidates) {
		candidate.finalScore = (candidate.completionRank + candidate.vocabUnlockRank + candidate.levelFitRank + candidate.bookOrderRank) / 4;
		candidate.recommendedCharacters = recommendHanja(candidate, catalog);
		candidate.recommendedCharacter = candidate.recommendedCharacters[0]?.character || "";
	}
	return candidates.sort((left, right) => left.finalScore - right.finalScore || left.chapter - right.chapter);
}

export function recommendHanja(chapter, catalog) {
	const levels = levelCatalog(catalog);
	return (chapter?.missingCharacters || []).map((character) => {
		const info = levels.characters.get(character);
		const contributionCount = (chapter.unlockedWords || []).filter((word) => (word.hanjaSpellings || [word.hanja]).some((hanja) => normalizeHanja(hanja).includes(character))).length;
		return {
			character,
			level: info?.level || "",
			levelIndex: info?.levelIndex ?? levels.outsideLevelIndex,
			catalogOrder: info?.order ?? Number.MAX_SAFE_INTEGER,
			contributionCount,
		};
	}).sort((left, right) => right.contributionCount - left.contributionCount
		|| left.levelIndex - right.levelIndex
		|| left.catalogOrder - right.catalogOrder
		|| compareStrings(left.character, right.character));
}

function compareStrings(left, right) {
	return left < right ? -1 : left > right ? 1 : 0;
}
