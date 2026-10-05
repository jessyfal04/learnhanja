export function frequencyRanks(entry) {
	return [entry.pokemonRank, entry.niklRank, entry.hermitDaveRank].map(Number).filter((rank) => rank > 0);
}

export function frequencyMean(entry) {
	const ranks = frequencyRanks(entry);
	return ranks.length ? ranks.reduce((sum, rank) => sum + rank, 0) / ranks.length : Number.MAX_SAFE_INTEGER;
}

export function frequencyMedian(entry) {
	const ranks = frequencyRanks(entry).sort((left, right) => left - right);
	if (!ranks.length) return Number.MAX_SAFE_INTEGER;
	const middle = Math.floor(ranks.length / 2);
	return ranks.length % 2 ? ranks[middle] : (ranks[middle - 1] + ranks[middle]) / 2;
}

export function formatFrequencyRank(rank) {
	if (!Number.isFinite(rank) || rank === Number.MAX_SAFE_INTEGER) return "—";
	return Number.isInteger(rank) ? rank.toLocaleString("ko-KR") : rank.toLocaleString("ko-KR", {maximumFractionDigits: 1});
}
