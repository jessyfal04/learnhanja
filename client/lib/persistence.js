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
	if (!snapshot || typeof snapshot !== "object") throw new Error("올바르지 않은 선택 목록 파일입니다");
	for (const [field, label] of [["deck", "덱"], ["noteType", "노트 유형"], ["characterField", "한자 필드"]]) {
		if (typeof snapshot[field] !== "string") throw new Error(`선택 목록 파일의 ${label} 값이 올바르지 않습니다`);
	}
	if (!Array.isArray(snapshot.selected) || snapshot.selected.some((value) => !/^[\u3400-\u9fff\uf900-\ufaff]$/u.test(value))) {
		throw new Error("선택 목록 파일에 올바르지 않은 한자가 있습니다");
	}
	return snapshot;
}
