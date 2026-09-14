export async function loadStaticJSON(path) {
	let response;
	try {
		response = await fetch(path);
	} catch {
		throw new Error(`정적 데이터를 불러올 수 없습니다: ${path}`);
	}
	if (!response.ok) throw new Error(`정적 데이터를 불러올 수 없습니다 (${response.status}): ${path}`);
	return response.json();
}
