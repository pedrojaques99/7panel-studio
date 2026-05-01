export const API = 'http://localhost:5000'

export function audioSrc(path: string): string {
  if (/^https?:\/\//i.test(path)) return path
  return `${API}/api/preview?path=${encodeURIComponent(path)}`
}
