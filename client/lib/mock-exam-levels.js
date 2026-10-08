export const mockExamPath = "/data/mock-exam.json?v=1";

export const mockExamLevels = [
	{value: "9", label: "9급"},
];

export function mockExamLevel(value) {
	return mockExamLevels.find((entry) => entry.value === value);
}
