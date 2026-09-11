export function showView(name) {
	const vocabulary = name === "vocabulary";
	document.getElementById("charactersView").classList.toggle("is-hidden", vocabulary);
	document.getElementById("vocabularyView").classList.toggle("is-hidden", !vocabulary);
	document.getElementById("charactersTab").classList.toggle("is-active", !vocabulary);
	document.getElementById("vocabularyTab").classList.toggle("is-active", vocabulary);
	window.location.hash = vocabulary ? "vocabulary" : "characters";
}
