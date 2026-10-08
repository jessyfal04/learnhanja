const views = ["connection", "characters", "recommendations", "cheonjamun", "vocabulary", "idioms", "insights", "games", "mockExam"];

export function showView(name) {
	const active = views.includes(name) ? name : "connection";
	for (const view of views) {
		document.getElementById(`${view}View`).classList.toggle("is-hidden", view !== active);
		document.getElementById(`${view}Tab`).classList.toggle("is-active", view === active);
	}
	window.location.hash = active;
	document.dispatchEvent(new CustomEvent("hanja-view-change", {detail: {view: active}}));
}
