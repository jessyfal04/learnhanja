import { isActiveStudyStatus } from "./study-status.js?v=2";

export function toggledSelection(selected, character) {
	const next = new Set(selected);
	if (next.has(character)) next.delete(character);
	else next.add(character);
	return next;
}

export function selectedByStatus(groups, status) {
	const selected = new Set();
	for (const group of groups || []) {
		for (const character of group.characters || []) {
			if (character.status === status) selected.add(character.value);
		}
	}
	return selected;
}

export function selectedFromAnki(catalog, statuses) {
	const selected = new Set();
	for (const group of catalog?.groups || []) {
		for (const character of group.characters) {
			const info = statuses?.characters?.[character.normalize("NFKC")];
			if (isActiveStudyStatus(info, "known")) selected.add(character);
		}
	}
	return selected;
}

export function withLevelSelection(selected, characters, select) {
	const next = new Set(selected);
	for (const character of characters || []) {
		if (select) next.add(character.value);
		else next.delete(character.value);
	}
	return next;
}
