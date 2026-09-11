import { api } from "./api.js";
import { state } from "./state.js";
import { toggledSelection, withLevelSelection } from "./selection.js";
import { setLoading, setOptions, showMessage } from "./ui.js";

const deckSelect = document.getElementById("deckSelect");
const noteTypeSelect = document.getElementById("noteTypeSelect");
const characterFieldSelect = document.getElementById("characterFieldSelect");

export async function loadCatalog() {
	try {
		state.catalog = await api("/api/levels");
		renderCatalog();
	} catch (error) {
		showMessage("danger", error.message);
	}
}

export async function loadMetadata() {
	const status = document.getElementById("ankiStatus");
	status.className = "tag is-medium is-warning is-light";
	status.textContent = "Connecting…";
	try {
		const metadata = await api("/api/anki");
		setOptions(deckSelect, metadata.decks, ["어문회::A. 독음", "日中韓漢字::A. Reco::A. Reco Hanja", "한자"]);
		status.className = "tag is-medium is-success is-light";
		status.textContent = `Connected · API ${metadata.version}`;
		await loadNoteTypes();
	} catch (error) {
		status.className = "tag is-medium is-danger is-light";
		status.textContent = "Anki unavailable";
		showMessage("warning", "The fixed catalog still works; Anki status is unavailable");
	}
}

export async function loadNoteTypes() {
	if (!deckSelect.value) return;
	const result = await api(`/api/anki/note-types?deck=${encodeURIComponent(deckSelect.value)}`);
	setOptions(noteTypeSelect, result.noteTypes, ["Hanja", "CJK Story"]);
	await loadFields();
}

export async function loadFields() {
	if (!noteTypeSelect.value) return;
	const result = await api(`/api/anki/fields?noteType=${encodeURIComponent(noteTypeSelect.value)}`);
	setOptions(characterFieldSelect, result.fields, ["Char", "Hanja", "漢字", "Character"]);
}

export async function refreshStatus() {
	const button = document.getElementById("refreshStatusButton");
	setLoading(button, true);
	try {
		state.ankiStatus = await api("/api/anki/status", {method: "POST", body: JSON.stringify({deck: deckSelect.value, noteType: noteTypeSelect.value, characterField: characterFieldSelect.value})});
		renderCatalog();
		showMessage("success", `Matched ${state.ankiStatus.total} catalog statuses from Anki`);
	} catch (error) {
		showMessage("danger", error.message);
	} finally {
		setLoading(button, false);
	}
}

export function selectStatus(status) {
	const selected = new Set();
	for (const [character, info] of Object.entries(state.ankiStatus?.characters || {})) if (info.status === status) selected.add(character);
	state.selected = selected;
	updateCharacterButtons();
	updateSelectionUI();
}

export function clearSelection() {
	state.selected = new Set();
	updateCharacterButtons();
	updateSelectionUI();
}

export function renderCatalog() {
	if (!state.catalog) return;
	let known = 0;
	let fresh = 0;
	for (const group of state.catalog.groups) for (const character of group.characters) {
		const status = state.ankiStatus?.characters?.[character]?.status;
		if (status === "known") known++;
		if (status === "new") fresh++;
	}
	document.getElementById("knownCount").textContent = `Known ${known}`;
	document.getElementById("newCount").textContent = `New ${fresh}`;
	document.getElementById("unknownCount").textContent = `Unknown ${state.catalog.total - known - fresh}`;
	const groups = document.getElementById("levelGroups");
	groups.replaceChildren(...state.catalog.groups.map(renderGroup));
	updateSelectionUI();
}

function renderGroup(group) {
	const box = document.createElement("div");
	box.className = "box";
	const heading = document.createElement("div");
	heading.className = "level mb-4";
	const title = document.createElement("h3");
	title.className = "title is-5 mb-0";
	title.textContent = `${group.level} · ${group.characters.length}`;
	const actions = document.createElement("div");
	actions.className = "buttons are-small";
	actions.append(actionButton("Select level", "is-link is-light", true), actionButton("Clear level", "is-light", false));
	heading.append(title, actions);
	box.appendChild(heading);
	const grid = document.createElement("div");
	grid.className = "hanja-grid";
	for (const value of group.characters) {
		const info = state.ankiStatus?.characters?.[value] || {status: "unknown"};
		const button = document.createElement("button");
		button.type = "button";
		button.className = `button hanja-button ${statusClass(info.status)}`;
		button.textContent = value;
		button.title = `${group.level} · ${info.status}${info.suspended ? " · suspended" : ""}`;
		button.dataset.character = value;
		button.classList.toggle("is-suspended", Boolean(info.suspended));
		button.addEventListener("click", () => { state.selected = toggledSelection(state.selected, value); updateCharacterButtons(); updateSelectionUI(); });
		grid.appendChild(button);
	}
	box.appendChild(grid);
	function actionButton(label, classes, select) {
		const button = document.createElement("button");
		button.type = "button";
		button.className = `button ${classes}`;
		button.textContent = label;
		button.addEventListener("click", () => { state.selected = withLevelSelection(state.selected, group.characters.map((value) => ({value})), select); updateCharacterButtons(); updateSelectionUI(); });
		return button;
	}
	return box;
}

function updateCharacterButtons() {
	for (const button of document.querySelectorAll(".hanja-button")) {
		const selected = state.selected.has(button.dataset.character);
		button.classList.toggle("is-selected", selected);
		button.setAttribute("aria-pressed", String(selected));
	}
}

function statusClass(status) {
	if (status === "known") return "is-success is-light";
	if (status === "new") return "is-info is-light";
	return "is-light";
}

function updateSelectionUI() {
	document.getElementById("selectedCount").textContent = String(state.selected.size);
	document.getElementById("buildVocabButton").disabled = state.selected.size === 0;
	updateCharacterButtons();
}
