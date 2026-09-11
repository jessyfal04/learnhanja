import { api } from "./api.js";
import { loadFields, loadNoteTypes, refreshStatus, renderCatalog } from "./anki.js";
import { createSnapshot, validateSnapshot } from "./persistence.js";
import { state } from "./state.js";
import { showMessage } from "./ui.js";

const deckSelect = document.getElementById("deckSelect");
const noteTypeSelect = document.getElementById("noteTypeSelect");
const characterFieldSelect = document.getElementById("characterFieldSelect");
const savedSelect = document.getElementById("savedSelect");

export function currentSnapshot() {
	return createSnapshot({
		deck: deckSelect.value,
		noteType: noteTypeSelect.value,
		characterField: characterFieldSelect.value,
	}, state.selected);
}

export async function refreshSaves() {
	try {
		const result = await api("/api/saves");
		savedSelect.replaceChildren();
		for (const save of result.saves || []) {
			const date = save.savedAt ? new Date(save.savedAt).toLocaleString() : "";
			savedSelect.add(new Option(`${save.name} · ${save.selected} chars · ${date}`, save.name));
		}
		const disabled = savedSelect.options.length === 0;
		document.getElementById("loadLocalButton").disabled = disabled;
		document.getElementById("deleteLocalButton").disabled = disabled;
	} catch (error) {
		showMessage("danger", error.message);
	}
}

export async function saveLocal() {
	try {
		const name = document.getElementById("saveName").value.trim();
		if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(name)) throw new Error("Use a 1-64 character save name");
		await api(`/api/saves/${encodeURIComponent(name)}`, {
			method: "PUT",
			body: JSON.stringify(currentSnapshot()),
		});
		await refreshSaves();
		savedSelect.value = name;
		showMessage("success", `Saved ${name}.json`);
	} catch (error) {
		showMessage("danger", error.message);
	}
}

export async function loadLocal() {
	if (!savedSelect.value) return;
	try {
		const snapshot = await api(`/api/saves/${encodeURIComponent(savedSelect.value)}`);
		await applySnapshot(snapshot);
		showMessage("success", `Loaded ${savedSelect.value}.json`);
	} catch (error) {
		showMessage("danger", error.message);
	}
}

export async function deleteLocal() {
	if (!savedSelect.value) return;
	try {
		const name = savedSelect.value;
		await api(`/api/saves/${encodeURIComponent(name)}`, { method: "DELETE" });
		await refreshSaves();
		showMessage("success", `Deleted ${name}.json`);
	} catch (error) {
		showMessage("danger", error.message);
	}
}

export async function saveBrowserFile() {
	try {
		const contents = JSON.stringify(currentSnapshot(), null, 2) + "\n";
		if ("showSaveFilePicker" in window) {
			const handle = await window.showSaveFilePicker({
				id: "hanja-vocab-selection",
				suggestedName: "hanja-selection.json",
				types: [{ description: "Hanja selection", accept: { "application/json": [".json"] } }],
			});
			const writable = await handle.createWritable();
			await writable.write(contents);
			await writable.close();
		} else {
			downloadJSON(contents);
		}
		showMessage("success", "Selection file saved");
	} catch (error) {
		if (error.name !== "AbortError") showMessage("danger", error.message);
	}
}

export async function openBrowserFile() {
	try {
		let file;
		if ("showOpenFilePicker" in window) {
			const [handle] = await window.showOpenFilePicker({
				id: "hanja-vocab-selection",
				types: [{ description: "Hanja selection", accept: { "application/json": [".json"] } }],
				multiple: false,
			});
			file = await handle.getFile();
		} else {
			file = await chooseUpload();
		}
		const snapshot = JSON.parse(await file.text());
		await applySnapshot(snapshot);
		showMessage("success", `Loaded ${file.name}`);
	} catch (error) {
		if (error.name !== "AbortError") showMessage("danger", error.message);
	}
}

async function applySnapshot(snapshot) {
	validateSnapshot(snapshot);
	state.selected = new Set(snapshot.selected);
	renderCatalog();
	if (snapshot.deck && snapshot.noteType && snapshot.characterField) {
		setExistingValue(deckSelect, snapshot.deck, "deck");
		await loadNoteTypes();
		setExistingValue(noteTypeSelect, snapshot.noteType, "note type");
		await loadFields();
		setExistingValue(characterFieldSelect, snapshot.characterField, "character field");
		await refreshStatus();
	}
}

function setExistingValue(select, value, label) {
	if (!Array.from(select.options).some((option) => option.value === value)) {
		throw new Error(`Saved ${label} ${value} is not available`);
	}
	select.value = value;
}

function downloadJSON(contents) {
	const url = URL.createObjectURL(new Blob([contents], { type: "application/json" }));
	const link = document.createElement("a");
	link.href = url;
	link.download = "hanja-selection.json";
	document.body.appendChild(link);
	link.click();
	link.remove();
	window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function chooseUpload() {
	return new Promise((resolve, reject) => {
		const input = document.getElementById("openFileInput");
		input.value = "";
		input.onchange = () => input.files[0] ? resolve(input.files[0]) : reject(new DOMException("No file selected", "AbortError"));
		input.click();
	});
}
