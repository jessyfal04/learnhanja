export const normalize = (value) => String(value || "").normalize("NFKC");
export const isHanja = (value) => /^\p{Script=Han}$/u.test(value);

export function parseText(text) {
	const characters = new Map();
	const ignored = [];
	let total = 0;
	for (const original of String(text || "")) {
		const character = normalize(original);
		if (!isHanja(character)) {
			if (!/\s/u.test(original)) ignored.push(original);
			continue;
		}
		total++;
		if (!characters.has(character)) characters.set(character, {character, originals: [], count: 0});
		const entry = characters.get(character);
		entry.count++;
		if (!entry.originals.includes(original)) entry.originals.push(original);
	}
	return {characters: [...characters.values()], total, ignored: [...new Set(ignored)]};
}

export function referenceFor(character, data) {
	return data?.characters?.[normalize(character)] || data?.characters?.[character] || {};
}

export function relatedForms(character, data, includeVariants) {
	return new Set([normalize(character), ...(includeVariants ? referenceFor(character, data).variants || [] : [])].map(normalize));
}

export function levelFor(character, catalog) {
	return catalog?.groups.find((group) => group.characters.some((c) => normalize(c) === normalize(character)))?.level;
}

export function studyInfo(character, statuses) {
	if (!statuses) return {status: "unverified", label: "미확인", color: "is-light", suspended: false};
	const entry = Object.entries(statuses.characters || {}).find(([key]) => normalize(key) === normalize(character))?.[1];
	const status = entry?.status || "absent";
	const suspended = Boolean(entry?.suspended);
	const label = suspended ? "일시 중단" : {known: "학습함", new: "새 카드", unknown: "상태 없음", absent: "카드 없음"}[status] || "상태 없음";
	const color = suspended ? "is-danger is-light" : {known: "is-success", new: "is-warning is-light", unknown: "is-status-unknown", absent: "is-light"}[status] || "is-status-unknown";
	return {status, label, color, suspended};
}

export function statusFor(character, statuses) {
	const info = studyInfo(character, statuses);
	return info.label;
}

export function filterRelated(entries, {text, characters, focus = "", mode = "any", query = "", data, variants = false}) {
	const forms = new Set(characters.flatMap((c) => [...relatedForms(c, data, variants)]));
	const focusForms = focus ? relatedForms(focus, data, variants) : forms;
	const needle = normalize(query).toLocaleLowerCase().trim();
	const normalizedText = normalize(text).trim();
	return entries.filter((entry) => {
		const word = normalize(entry.hanja);
		const chars = [...word].filter(isHanja);
		if (!chars.some((c) => focusForms.has(c))) return false;
		if (mode === "exact" && word !== normalizedText) return false;
		if (mode === "inside" && !normalizedText.includes(word)) return false;
		if (mode === "only" && (entry.partial || !chars.every((c) => forms.has(c)))) return false;
		return !needle || normalize(`${entry.hanja} ${entry.hangul || entry.korean} ${(entry.definitions || entry.meanings || []).join(" ")}`).toLocaleLowerCase().includes(needle);
	});
}
