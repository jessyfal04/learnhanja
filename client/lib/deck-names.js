export function preferredDeck(decks, preferredNames) {
	for (const preferredName of preferredNames) {
		const normalizedName = normalizeDeckName(preferredName);
		const match = (decks || []).find((deck) => normalizeDeckName(deck).includes(normalizedName));
		if (match) return match;
	}
	return "";
}

export function normalizeDeckName(value) {
	return String(value || "").normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}
