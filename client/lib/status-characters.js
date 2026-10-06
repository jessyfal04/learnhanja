import { studyStatusPresentation } from "./study-status.js?v=2";

const hanCharacter = /[\u3400-\u9fff\uf900-\ufaff]/u;

export function fillStatusCharacters(container, text, ankiStatus) {
	container.textContent = "";
	for (const character of Array.from(text || "")) {
		if (!hanCharacter.test(character)) {
			container.append(character);
			continue;
		}
		const info = ankiStatus?.characters?.[character.normalize("NFKC")];
		const presentation = studyStatusPresentation(info, {unverified: !ankiStatus, absent: Boolean(ankiStatus && !info)});
		const characterElement = document.createElement("span");
		characterElement.className = `idiom-status-character ${presentation.classes}`;
		characterElement.textContent = character;
		characterElement.title = presentation.label;
		characterElement.setAttribute("aria-label", `${character} · ${presentation.label}`);
		container.append(characterElement);
	}
	return container;
}
