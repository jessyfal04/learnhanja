const presentations = {
	"known-active": {label: "학습함", classes: "is-success"},
	"new-active": {label: "새 카드", classes: "is-info"},
	"known-suspended": {label: "학습함 · 일시 중단", classes: "is-warning"},
	"new-suspended": {label: "새 카드 · 일시 중단", classes: "is-danger"},
	unknown: {label: "상태 없음", classes: "is-dark"},
	absent: {label: "카드 없음", classes: "is-dark"},
	unverified: {label: "미확인", classes: "is-dark"},
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
