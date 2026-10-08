import { studyStatusPresentation } from "./study-status.js";

export function characterDeckPresentation(dokeum, moyang, huneum, {moyangReady = true, huneumReady = true} = {}) {
	const dokeumPresentation = studyStatusPresentation(dokeum);
	const classes = moyang?.status === "known" && dokeum?.status !== "known"
		? "is-danger is-light"
		: dokeumPresentation.classes;
	const label = [
		`독음 ${dokeumPresentation.label}`,
		`모양 ${studyStatusPresentation(moyang, {unverified: !moyangReady, absent: moyangReady && !moyang}).label}`,
		`훈음 ${studyStatusPresentation(huneum, {unverified: !huneumReady, absent: huneumReady && !huneum}).label}`,
	].join(" · ");
	return {classes, label};
}
