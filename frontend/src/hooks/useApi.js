const API_BASE = '';

export async function apiFetch(path, options = {}) {
    const apiKey = localStorage.getItem('forge_api_key');
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers,
    };
    if (apiKey) {
        headers['x-api-key'] = apiKey;
    }

    const res = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers,
    });

    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `API error: ${res.status}`);
    }

    return res.json();
}

export function useApiKey() {
    const get = () => localStorage.getItem('forge_api_key') || '';
    const set = (key) => {
        localStorage.setItem('forge_api_key', key);
        window.dispatchEvent(new Event('apikey-change'));
    };
    const clear = () => {
        localStorage.removeItem('forge_api_key');
        window.dispatchEvent(new Event('apikey-change'));
    };
    return { getKey: get, setKey: set, clearKey: clear };
}
