export const mockExamLevels = [
	{value: "9", label: "9급", path: "/data/mock-exam-9.json"},
];

export function mockExamLevel(value) {
	return mockExamLevels.find((entry) => entry.value === value);
}
