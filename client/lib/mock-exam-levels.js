export const mockExamPath = "/data/mock-exam.json?v=2";

export const mockExamLevels = [
	{value: "9", label: "9급"},
	{value: "8", label: "8급"},
];

export function mockExamLevel(value) {
	return mockExamLevels.find((entry) => entry.value === value);
}
