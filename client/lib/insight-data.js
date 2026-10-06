import { studyStatusPresentation } from "./study-status.js?v=2";

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

export function hangulCandidates(vocabulary, idioms, text) {
	const query = String(text || "").normalize("NFC").trim();
	if (!query || !/^\p{Script=Hangul}+$/u.test(query)) return [];
	const direct = [
		...(vocabulary || []).filter((entry) => String(entry.hangul || "").normalize("NFC") === query),
		...(idioms || []).filter((entry) => !entry.partial && String(entry.korean || "").normalize("NFC") === query).map((entry) => ({...entry, hangul: entry.korean})),
	];
	const matches = direct.length ? direct : compoundCandidates(vocabulary, query);
	const unique = new Map();
	for (const entry of matches) {
		const hanja = normalize(entry.hanja).trim();
		if (hanja && parseText(hanja).characters.length && !unique.has(hanja)) unique.set(hanja, {...entry, hanja});
	}
	return [...unique.values()];
}

export function decomposeHanja(vocabulary, entry, references) {
	const hanja = normalize(entry?.hanja).trim();
	const characters = Array.from(hanja).filter(isHanja);
	if (characters.length < 2 || characters.join("") !== hanja) return null;
	const semantic = semanticComponents(vocabulary, hanja);
	const components = semantic.length > 1 ? semantic : characters.map((character) => {
		const ref = referenceFor(character, references);
		return {
			hangul: ref.sound || ref.hangul?.[0] || "?",
			hanja: character,
			definition: ref.hun || "글자 풀이 없음",
			meaning: ref.definition || "뜻 자료 없음",
		};
	});
	return {
		hangul: String(entry?.hangul || "").normalize("NFC").trim() || components.map((part) => part.hangul).join(""),
		hanja,
		composed: true,
		components,
	};
}

function semanticComponents(vocabulary, hanja) {
	const hanjaCharacters = Array.from(hanja);
	const paths = Array.from({length: hanjaCharacters.length + 1}, () => []);
	paths[0].push([]);
	for (let start = 0; start < paths.length - 1; start++) {
		if (!paths[start].length) continue;
		for (const entry of vocabulary || []) {
			const partHanja = normalize(entry.hanja).trim();
			const partCharacters = Array.from(partHanja);
			const length = partCharacters.length;
			if (length < 2 || length >= paths.length - 1 || hanjaCharacters.slice(start, start + length).join("") !== partHanja) continue;
			const part = {
				hangul: String(entry.hangul || "").normalize("NFC").trim(),
				hanja: partHanja,
				definition: (entry.definitions || [])[0] || "",
				meaning: (entry.meanings || []).join(" · "),
			};
			for (const path of paths[start]) paths[start + length].push([...path, part]);
		}
	}
	return paths.at(-1).filter((path) => path.length > 1).sort((left, right) => left.length - right.length)[0] || [];
}

function compoundCandidates(vocabulary, query) {
	const byHangul = new Map();
	for (const entry of vocabulary || []) {
		const word = String(entry.hangul || "").normalize("NFC").trim();
		if (Array.from(word).length < 2 || !/^\p{Script=Hangul}+$/u.test(word) || !parseText(entry.hanja).characters.length) continue;
		if (!byHangul.has(word)) byHangul.set(word, []);
		byHangul.get(word).push(entry);
	}
	const syllables = Array.from(query);
	const paths = Array.from({length: syllables.length + 1}, () => []);
	paths[0].push({hanja: "", parts: []});
	for (let end = 2; end <= syllables.length; end++) {
		for (let start = 0; start <= end - 2; start++) {
			if (!paths[start].length) continue;
			const part = syllables.slice(start, end).join("");
			for (const entry of byHangul.get(part) || []) {
				for (const path of paths[start]) {
					if (path.parts.length >= 3 || paths[end].length >= 24) continue;
					paths[end].push({
						hanja: path.hanja + normalize(entry.hanja),
						parts: [...path.parts, {
							hangul: part,
							hanja: normalize(entry.hanja),
							definition: (entry.definitions || [])[0] || "",
							meaning: (entry.meanings || []).join(" · "),
						}],
					});
				}
			}
		}
	}
	return paths.at(-1).filter((path) => path.parts.length > 1).map((path) => ({
		hangul: query,
		hanja: path.hanja,
		definitions: [`${path.parts.map((part) => part.hangul).join(" + ")} 조합`],
		composed: true,
		components: path.parts,
	}));
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
	if (!statuses) {
		const presentation = studyStatusPresentation(null, {unverified: true});
		return {status: "unverified", label: presentation.label, color: presentation.classes, suspended: false, key: presentation.key};
	}
	const entry = Object.entries(statuses.characters || {}).find(([key]) => normalize(key) === normalize(character))?.[1];
	const status = entry?.status || "absent";
	const suspended = Boolean(entry?.suspended);
	const presentation = studyStatusPresentation(entry, {absent: !entry});
	return {status, label: presentation.label, color: presentation.classes, suspended, key: presentation.key};
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
