export const API = import.meta.env.VITE_API_URL || 'http://localhost:5000'
export const CLOUD_API = import.meta.env.VITE_CLOUD_API_URL || ''

let _backendOnline: boolean | null = null
let _checkPromise: Promise<boolean> | null = null

export function checkBackend(): Promise<boolean> {
  if (_backendOnline !== null) return Promise.resolve(_backendOnline)
  if (_checkPromise) return _checkPromise
  _checkPromise = fetch(`${API}/api/config`, { signal: AbortSignal.timeout(2000) })
    .then(() => { _backendOnline = true; return true })
    .catch(() => { _backendOnline = false; return false })
  return _checkPromise
}

export function isBackendOnline() { return _backendOnline === true }
export function hasCloudApi() { return CLOUD_API.length > 0 }

const CLOUD_ROUTES: Record<string, string> = {
  '/api/yt-download': '/api/studio/yt-download',
  '/api/yt-stream': '/api/studio/yt-stream',
  '/api/upload': '/api/studio/upload',
  '/api/preview': '/api/studio/preview',
  '/api/convert/wav-to-mp3': '/api/studio/convert',
  '/api/convert/status/': '/api/studio/convert/status/',
  '/api/duration': '/api/studio/duration',
}

export function resolveUrl(localPath: string): string {
  if (isBackendOnline()) return `${API}${localPath}`
  if (!hasCloudApi()) return `${API}${localPath}`
  for (const [local, cloud] of Object.entries(CLOUD_ROUTES)) {
    if (localPath.startsWith(local)) {
      return `${CLOUD_API}${cloud}${localPath.slice(local.length)}`
    }
  }
  return `${API}${localPath}`
}

export function apiFetch(localPath: string, init?: RequestInit): Promise<Response> {
  return fetch(resolveUrl(localPath), init)
}

export function audioSrc(path: string): string {
  if (/^https?:\/\//i.test(path)) return path
  return resolveUrl(`/api/preview?path=${encodeURIComponent(path)}`)
}
