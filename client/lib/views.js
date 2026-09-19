const views = ["connection", "characters", "vocabulary", "idioms", "insights"];

export function showView(name) {
	const active = views.includes(name) ? name : "connection";
	for (const view of views) {
		document.getElementById(`${view}View`).classList.toggle("is-hidden", view !== active);
		document.getElementById(`${view}Tab`).classList.toggle("is-active", view === active);
	}
	window.location.hash = active;
}
