export async function api(path, options = {}) {
	let response;
	try {
		response = await fetch(path, {headers: { "Content-Type": "application/json", ...(options.headers || {}) }, ...options});
	} catch {
		throw new Error("서버에 연결할 수 없습니다");
	}
	const contentType = response.headers.get("content-type") || "";
	const payload = contentType.includes("application/json") ? await response.json() : await response.text();
	if (!response.ok) {
		const message = payload && payload.error ? payload.error : `요청을 처리할 수 없습니다 (${response.status})`;
		throw new Error(message);
	}
	return payload;
}
