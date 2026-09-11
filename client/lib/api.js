export async function api(path, options = {}) {
	const response = await fetch(path, {
		headers: { "Content-Type": "application/json", ...(options.headers || {}) },
		...options,
	});
	const contentType = response.headers.get("content-type") || "";
	const payload = contentType.includes("application/json") ? await response.json() : await response.text();
	if (!response.ok) {
		const message = payload && payload.error ? payload.error : String(payload || response.statusText);
		throw new Error(message);
	}
	return payload;
}
