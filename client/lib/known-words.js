import { state } from "./state.js";
import { koreanError, showMessage } from "./ui.js";

export function parseKnownWords(text) {
	return new Set(String(text || "").replace(/^\uFEFF/u, "").split(/\r?\n/u).map((word) => word.trim().normalize("NFC")).filter(Boolean));
}

export function normalizeKnownWords(words) {
	if (!Array.isArray(words)) throw new Error("단어 목록 형식이 올바르지 않습니다");
	return new Set(words.map((word) => String(word).trim().normalize("NFC")).filter(Boolean));
}

export async function fetchKnownWords(port, fetcher = fetch) {
	const number = Number(port);
	if (!Number.isInteger(number) || number < 1 || number > 65535) throw new Error("1~65535 사이의 포트 번호를 입력하세요");
	let response;
	try {
		response = await fetcher(`http://127.0.0.1:${number}/`, {
			method: "POST",
			headers: {"Content-Type": "application/json"},
			body: JSON.stringify({action: "getKnownWords", version: 1}),
		});
	} catch {
		throw new Error(`로컬 포트 ${number}에 연결할 수 없습니다`);
	}
	if (!response.ok) throw new Error(`아는 단어 요청에 실패했습니다 (${response.status})`);
	const payload = await response.json();
	if (payload.error) throw new Error(String(payload.error));
	return {
		knownWords: normalizeKnownWords(payload.result?.words),
		markedWords: normalizeKnownWords(payload.result?.markedWords || []),
	};
}

export function initializeKnownWords() {
	const fileInput = document.getElementById("knownWordsFile");
	const portInput = document.getElementById("knownWordsPort");
	const button = document.getElementById("loadKnownWordsPort");
	fileInput.addEventListener("change", async () => {
		const file = fileInput.files?.[0];
		if (!file) return;
		try {
			setKnownWords(parseKnownWords(await file.text()), new Set(), file.name);
		} catch (error) {
			showMessage("danger", koreanError(error, "TXT 파일을 읽을 수 없습니다"));
		}
	});
	button.addEventListener("click", () => { void loadKnownWordsPort(true); });
	void loadKnownWordsPort(false);
}

async function loadKnownWordsPort(showError) {
	const portInput = document.getElementById("knownWordsPort");
	const button = document.getElementById("loadKnownWordsPort");
	const status = document.getElementById("knownWordsStatus");
	button.classList.add("is-loading");
	status.className = "help has-text-warning";
	status.textContent = `로컬 포트 ${portInput.value}에 연결 중…`;
	try {
		const result = await fetchKnownWords(portInput.value);
		setKnownWords(result.knownWords, result.markedWords, `로컬 포트 ${portInput.value}`);
	} catch (error) {
		state.knownWords = new Set();
		state.markedWords = new Set();
		state.knownWordsSource = "";
		status.className = "help has-text-danger";
		status.textContent = `로컬 포트 ${portInput.value} · 연결되지 않음`;
		document.dispatchEvent(new Event("hanja-known-words-change"));
		if (showError) showMessage("danger", koreanError(error, "아는 단어를 불러올 수 없습니다"));
	} finally {
		button.classList.remove("is-loading");
	}
}

function setKnownWords(words, markedWords, source) {
	state.knownWords = words;
	state.markedWords = markedWords;
	state.knownWordsSource = source;
	const status = document.getElementById("knownWordsStatus");
	status.className = "help has-text-success";
	status.textContent = `${source} · 아는 단어 ${words.size}개 · 표시한 단어 ${markedWords.size}개`;
	document.dispatchEvent(new Event("hanja-known-words-change"));
}
