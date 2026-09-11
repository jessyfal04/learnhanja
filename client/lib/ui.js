let messageTimer = null;

export function showMessage(type, message) {
	const box = document.getElementById("message");
	box.className = `notification is-${type}`;
	document.getElementById("messageText").textContent = message;
	window.clearTimeout(messageTimer);
	messageTimer = window.setTimeout(hideMessage, 6000);
}

export function hideMessage() {
	document.getElementById("message").classList.add("is-hidden");
}

export function setOptions(select, values, preferred, includeBlank = false) {
	select.replaceChildren();
	if (includeBlank) select.add(new Option("No level grouping", ""));
	for (const value of values || []) select.add(new Option(value, value));
	const match = preferred.find((candidate) => Array.from(select.options).some((option) => option.value === candidate));
	if (match) select.value = match;
}

export function setLoading(button, loading, label) {
	button.disabled = loading;
	button.classList.toggle("is-loading", loading);
	if (label) button.textContent = label;
}
