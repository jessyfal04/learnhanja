const presentations = {
	"known-active": {label: "학습함", classes: "is-link is-light"},
	"new-active": {label: "새 카드", classes: "is-warning"},
	"known-suspended": {label: "학습함 · 일시 중단", classes: "is-dark"},
	"new-suspended": {label: "새 카드 · 일시 중단", classes: "is-danger is-light"},
	unknown: {label: "상태 없음", classes: "is-light"},
	absent: {label: "카드 없음", classes: "is-light"},
	unverified: {label: "미확인", classes: "is-light"},
};

export function studyStatusKey(info, {absent = false, unverified = false} = {}) {
	if (unverified) return "unverified";
	if (absent) return "absent";
	if (info?.status === "known") return info.suspended ? "known-suspended" : "known-active";
	if (info?.status === "new") return info.suspended ? "new-suspended" : "new-active";
	return "unknown";
}

export function studyStatusPresentation(info, options) {
	const key = studyStatusKey(info, options);
	return {key, ...presentations[key]};
}

export function isActiveStudyStatus(info, status) {
	return info?.status === status && !info.suspended;
}
