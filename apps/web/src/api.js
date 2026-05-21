const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";
async function readJson(response) {
    if (!response.ok) {
        let message = "No pudimos completar la accion.";
        try {
            const body = (await response.json());
            if (body.message) {
                message = body.message;
            }
        }
        catch {
            message = response.statusText || message;
        }
        throw new Error(message);
    }
    return (await response.json());
}
export function getApiUrl() {
    return API_URL;
}
export async function apiRequest(path, options = {}) {
    const { body, token, headers, ...rest } = options;
    const requestHeaders = new Headers(headers ?? {});
    if (token) {
        requestHeaders.set("Authorization", `Bearer ${token}`);
    }
    const isFormData = typeof FormData !== "undefined" && body instanceof FormData;
    if (body !== undefined && !isFormData && !requestHeaders.has("Content-Type")) {
        requestHeaders.set("Content-Type", "application/json");
    }
    const response = await fetch(`${API_URL}${path}`, {
        ...rest,
        headers: requestHeaders,
        body: body === undefined ? undefined : isFormData ? body : JSON.stringify(body),
    });
    return readJson(response);
}
