import { api } from "./api.js";
import { loadFields, loadNoteTypes, refreshStatus, renderCatalog } from "./anki.js";
import { createSnapshot, validateSnapshot } from "./persistence.js";
import { state } from "./state.js";
import { koreanError, showMessage } from "./ui.js";

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
			const date = save.savedAt ? new Date(save.savedAt).toLocaleString("ko-KR") : "";
			savedSelect.add(new Option(`${save.name} · ${save.selected}자 · ${date}`, save.name));
		}
		const disabled = savedSelect.options.length === 0;
		document.getElementById("loadLocalButton").disabled = disabled;
		document.getElementById("deleteLocalButton").disabled = disabled;
	} catch (error) {
		showMessage("danger", koreanError(error, "저장 목록을 불러올 수 없습니다"));
	}
}

export async function saveLocal() {
	try {
		const name = document.getElementById("saveName").value.trim();
		if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(name)) throw new Error("저장 이름은 영문자, 숫자, 점, 밑줄, 붙임표로 1~64자까지 입력하세요");
		await api(`/api/saves/${encodeURIComponent(name)}`, {
			method: "PUT",
			body: JSON.stringify(currentSnapshot()),
		});
		await refreshSaves();
		savedSelect.value = name;
		showMessage("success", `${name}.json을 저장했습니다`);
	} catch (error) {
		showMessage("danger", koreanError(error, "선택 목록을 저장할 수 없습니다"));
	}
}

export async function loadLocal() {
	if (!savedSelect.value) return;
	try {
		const snapshot = await api(`/api/saves/${encodeURIComponent(savedSelect.value)}`);
		await applySnapshot(snapshot);
		showMessage("success", `${savedSelect.value}.json을 불러왔습니다`);
	} catch (error) {
		showMessage("danger", koreanError(error, "선택 목록을 불러올 수 없습니다"));
	}
}

export async function deleteLocal() {
	if (!savedSelect.value) return;
	try {
		const name = savedSelect.value;
		await api(`/api/saves/${encodeURIComponent(name)}`, { method: "DELETE" });
		await refreshSaves();
		showMessage("success", `${name}.json을 삭제했습니다`);
	} catch (error) {
		showMessage("danger", koreanError(error, "선택 목록을 삭제할 수 없습니다"));
	}
}

export async function saveBrowserFile() {
	try {
		const contents = JSON.stringify(currentSnapshot(), null, 2) + "\n";
		if ("showSaveFilePicker" in window) {
			const handle = await window.showSaveFilePicker({
				id: "hanja-vocab-selection",
				suggestedName: "한자-선택.json",
				types: [{ description: "한자 선택 목록", accept: { "application/json": [".json"] } }],
			});
			const writable = await handle.createWritable();
			await writable.write(contents);
			await writable.close();
		} else {
			downloadJSON(contents);
		}
		showMessage("success", "선택 목록 파일을 저장했습니다");
	} catch (error) {
		if (error.name !== "AbortError") showMessage("danger", koreanError(error, "파일을 저장할 수 없습니다"));
	}
}

export async function openBrowserFile() {
	try {
		let file;
		if ("showOpenFilePicker" in window) {
			const [handle] = await window.showOpenFilePicker({
				id: "hanja-vocab-selection",
				types: [{ description: "한자 선택 목록", accept: { "application/json": [".json"] } }],
				multiple: false,
			});
			file = await handle.getFile();
		} else {
			file = await chooseUpload();
		}
		const snapshot = JSON.parse(await file.text());
		await applySnapshot(snapshot);
		showMessage("success", `${file.name}을 불러왔습니다`);
	} catch (error) {
		if (error.name !== "AbortError") showMessage("danger", koreanError(error, "파일을 불러올 수 없습니다"));
	}
}

async function applySnapshot(snapshot) {
	validateSnapshot(snapshot);
	state.selected = new Set(snapshot.selected);
	renderCatalog();
	if (snapshot.deck && snapshot.noteType && snapshot.characterField) {
		setExistingValue(deckSelect, snapshot.deck, "덱");
		await loadNoteTypes();
		setExistingValue(noteTypeSelect, snapshot.noteType, "노트 유형");
		await loadFields();
		setExistingValue(characterFieldSelect, snapshot.characterField, "한자 필드");
		await refreshStatus();
	}
}

function setExistingValue(select, value, label) {
	if (!Array.from(select.options).some((option) => option.value === value)) {
		throw new Error(`저장된 ${label} '${value}'을(를) 사용할 수 없습니다`);
	}
	select.value = value;
}

function downloadJSON(contents) {
	const url = URL.createObjectURL(new Blob([contents], { type: "application/json" }));
	const link = document.createElement("a");
	link.href = url;
	link.download = "한자-선택.json";
	document.body.appendChild(link);
	link.click();
	link.remove();
	window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function chooseUpload() {
	return new Promise((resolve, reject) => {
		const input = document.getElementById("openFileInput");
		input.value = "";
		input.onchange = () => input.files[0] ? resolve(input.files[0]) : reject(new DOMException("선택한 파일이 없습니다", "AbortError"));
		input.click();
	});
}
