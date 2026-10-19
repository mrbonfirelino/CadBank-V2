const TOKEN_KEY = 'cadbank_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}
export function setToken(t) {
  t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY);
}

export async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (!(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const res = await fetch('/api' + path, { ...options, headers });
  if (res.status === 401) {
    setToken('');
    window.location.href = '/login';
    throw new Error('Não autenticado');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Erro na requisição');
  return data;
}

export function fileUrl(path) {
  return `/api${path}${path.includes('?') ? '&' : '?'}token=${encodeURIComponent(getToken())}`;
}

export async function downloadFile(path, filename) {
  const res = await fetch('/api' + path, {
    headers: { Authorization: 'Bearer ' + getToken() }
  });
  if (!res.ok) throw new Error('Falha no download');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function downloadPost(path, body, filename) {
  const res = await fetch('/api' + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + getToken() },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Falha no download');
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function fetchBlob(path) {
  const res = await fetch('/api' + path, {
    headers: { Authorization: 'Bearer ' + getToken() }
  });
  if (!res.ok) throw new Error('Falha ao carregar arquivo');
  return res.arrayBuffer();
}
