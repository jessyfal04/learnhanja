export function trackQuestionTime(session, now) {
	if (session.timingIndex != null) {
		session.questionTimeMs[session.timingIndex] += Math.max(0, now - session.timingStartedAt);
	}
	session.timingIndex = session.index;
	session.timingStartedAt = now;
}

export function pauseQuestionTime(session, now) {
	if (session.timingIndex === null) return;
	session.questionTimeMs[session.timingIndex] += Math.max(0, now - session.timingStartedAt);
	session.timingIndex = null;
	session.timingStartedAt = null;
}

export function timeByType(questions, questionTimeMs = []) {
	const rows = new Map();
	for (const [index, question] of questions.entries()) {
		const row = rows.get(question.type) || {type: question.type, title: question.title, count: 0, milliseconds: 0};
		row.count++;
		row.milliseconds += Math.max(0, questionTimeMs[index] || 0);
		rows.set(question.type, row);
	}
	return [...rows.values()];
}
