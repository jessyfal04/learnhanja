export function createSnapshot(config, selected, now = new Date()) {
	const snapshot = {
		version: 1,
		savedAt: now.toISOString(),
		deck: String(config.deck || "").trim(),
		noteType: String(config.noteType || "").trim(),
		characterField: String(config.characterField || "").trim(),
		selected: Array.from(new Set(selected || [])).sort(),
	};
	validateSnapshot(snapshot);
	return snapshot;
}

export function validateSnapshot(snapshot) {
	if (!snapshot || typeof snapshot !== "object") throw new Error("Invalid selection file");
	for (const field of ["deck", "noteType", "characterField"]) {
		if (typeof snapshot[field] !== "string") throw new Error(`Selection file has invalid ${field}`);
	}
	if (!Array.isArray(snapshot.selected) || snapshot.selected.some((value) => !/^[\u3400-\u9fff\uf900-\ufaff]$/u.test(value))) {
		throw new Error("Selection file contains invalid Hanja characters");
	}
	return snapshot;
}
