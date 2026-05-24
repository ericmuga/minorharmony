// Tiny fetch wrapper — always sends the session cookie.
async function req(method, url, body) {
  const opts = { method, credentials: 'include', headers: {} };
  if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  const res = await fetch('/api' + url, opts);
  if (res.status === 401) { window.dispatchEvent(new CustomEvent('unauthorized')); throw new Error('unauthorized'); }
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
  return res.status === 204 ? null : res.json();
}
export const api = {
  get:  (u) => req('GET', u),
  post: (u, b) => req('POST', u, b),
  put:  (u, b) => req('PUT', u, b),
  patch:(u, b) => req('PATCH', u, b),
  del:  (u) => req('DELETE', u),
};
