const characterFamilies = [
	"人兒父母夫女子老兄弟民士臣", "心手目身面足口耳首肉", "馬牛羊魚鳥犬", "水火土木石山川雨天月日夕田風", "一二三四五六七八九十百千萬", "東西南北中上下內外前後", "大少小高長太低短", "王玉金貝車門衣食", "書文言字音聲", "生死年世今古來去", "工業商市家國軍兵",
];

const radicalFamilies = [
	"儿臼兒几八", "廴聿建辶彳", "口囗日曰目", "土士干王玉", "木禾示本朩", "月肉目日", "水氵氺冫", "火灬木", "人亻入八", "刀刂力方", "女子宀", "田由甲申", "艸艹竹禾", "車東重", "雨雪雷", "言音立", "衣衤示礻", "心忄手扌", "大犬太夫", "山川巛州", "貝見頁", "十千干午", "一丨丶丿乙亅",
];

const shuffle = (values, random) => {
	const result = [...values];
	for (let index = result.length - 1; index > 0; index--) {
		const swap = Math.floor(random() * (index + 1));
		[result[index], result[swap]] = [result[swap], result[index]];
	}
	return result;
};

const inSameFamily = (left, right, families) => families.some((family) => family.includes(left) && family.includes(right));
const sharedHanja = (left, right) => [...left].filter((character) => right.includes(character)).length;

function readingSimilarity(left, right) {
	if (!left || !right || left === right || left.length !== right.length) return 0;
	let score = 0;
	for (let index = 0; index < left.length; index++) {
		if (left[index] === right[index]) { score += 3; continue; }
		const first = left.charCodeAt(index) - 0xac00;
		const second = right.charCodeAt(index) - 0xac00;
		if (first < 0 || first >= 11172 || second < 0 || second >= 11172) continue;
		if (Math.floor(first / 588) === Math.floor(second / 588)) score++;
		if (Math.floor(first / 28) % 21 === Math.floor(second / 28) % 21) score++;
	}
	return score;
}

function definitionSimilarity(left, right) {
	const tokens = (text) => (text.match(/[가-힣]{2,}/gu) || []).filter((token) => !["어떤", "것을", "것이", "등을", "등의", "있는", "하는"].includes(token));
	const a = tokens(left);
	const b = tokens(right);
	return a.reduce((score, token) => score + (b.some((other) => token.includes(other) || other.includes(token)) ? 1 : 0), 0);
}

function selectChoices(correct, candidates, random) {
	const best = new Map();
	for (const candidate of candidates) {
		if (!candidate.value || candidate.value === correct) continue;
		const score = candidate.score + random() * 0.5;
		if (score > (best.get(candidate.value)?.score ?? -Infinity)) best.set(candidate.value, {value: candidate.value, score});
	}
	const wrong = [...best.values()].sort((left, right) => right.score - left.score).slice(0, 4).map((entry) => entry.value);
	if (wrong.length !== 4) throw new Error("문항 선택지가 부족합니다");
	return shuffle([correct, ...wrong], random);
}

function strokeChoices(target, random) {
	const lowest = Math.max(1, target.strokes - 4);
	const start = lowest + Math.floor(random() * (target.strokes - lowest + 1));
	return shuffle(Array.from({length: 5}, (_, index) => String(start + index)), random);
}

function radicalChoices(target, entries, random) {
	const values = new Set([...entries.map((entry) => entry.radical), target.hanja]);
	for (const family of radicalFamilies) if (family.includes(target.radical)) for (const value of family) values.add(value);
	return selectChoices(target.radical, [...values].map((value) => ({
		value,
		score: inSameFamily(target.radical, value, radicalFamilies) ? 12 : value === target.hanja ? 6 : 0,
	})), random);
}

function characterChoices(type, target, entries, random) {
	let correct;
	let candidates;
	switch (type) {
		case "characterSound":
			correct = target.sound;
			candidates = entries.map((entry) => ({value: entry.sound, score: readingSimilarity(correct, entry.sound) + (inSameFamily(target.hanja, entry.hanja, characterFamilies) ? 4 : 0)}));
			if (/^[가-힣]$/u.test(target.meaning)) candidates.push({value: target.meaning, score: 15});
			candidates = candidates.filter((entry) => !(target.sounds || []).includes(entry.value));
			break;
		case "soundCharacter":
			correct = target.hanja;
			candidates = entries.filter((entry) => !(entry.sounds || [entry.sound]).includes(target.sound) && entry.sound !== target.sound).map((entry) => ({
				value: entry.hanja,
				score: readingSimilarity(target.sound, entry.sound) + (inSameFamily(target.hanja, entry.hanja, characterFamilies) ? 4 : 0),
			}));
			break;
		case "characterMeaning":
			correct = target.meaning;
			candidates = entries.map((entry) => ({value: entry.meaning, score: inSameFamily(target.hanja, entry.hanja, characterFamilies) ? 12 : 0}));
			break;
		case "meaningCharacter":
			correct = target.hanja;
			candidates = entries.filter((entry) => entry.meaning !== target.meaning).map((entry) => ({value: entry.hanja, score: inSameFamily(target.hanja, entry.hanja, characterFamilies) ? 12 : 0}));
			break;
	}
	return selectChoices(correct, candidates, random);
}

function wordChoices(type, target, entries, random) {
	const answerField = type === "wordSound" || type === "sentenceSound" ? "reading" : type === "wordMeaning" || type === "sentenceMeaning" ? "meaning" : "hanja";
	const correct = target[answerField];
	const candidates = entries.filter((entry) => {
		if (type === "soundWord") return entry.reading !== target.reading;
		if (type === "meaningWord") return entry.meaning !== target.meaning;
		return entry[answerField] !== correct;
	}).map((entry) => ({
		value: entry[answerField],
		score: sharedHanja(target.hanja, entry.hanja) * 6
			+ readingSimilarity(target.reading, entry.reading) * 2
			+ definitionSimilarity(target.meaning, entry.meaning) * 8
			- Math.abs(target.meaning.length - entry.meaning.length) * (answerField === "meaning" ? 2 : 0),
	}));
	return selectChoices(correct, candidates, random);
}

export function examChoices(type, target, entries, random) {
	if (type === "strokes") return strokeChoices(target, random);
	if (type === "radical") return radicalChoices(target, entries, random);
	if (["characterSound", "soundCharacter", "characterMeaning", "meaningCharacter"].includes(type)) return characterChoices(type, target, entries, random);
	return wordChoices(type, target, entries, random);
}
