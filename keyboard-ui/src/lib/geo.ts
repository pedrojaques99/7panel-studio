export type Geo = { x: number; y: number; w: number; h: number }

export function loadGeo(id: string, def: Geo): Geo {
  try { return { ...def, ...JSON.parse(localStorage.getItem(`panel-geo-${id}`) || '{}') } } catch { return def }
}

export function saveGeo(id: string, g: Partial<Geo>) {
  const cur = loadGeo(id, { x: 0, y: 0, w: 0, h: 0 })
  localStorage.setItem(`panel-geo-${id}`, JSON.stringify({ ...cur, ...g }))
  window.dispatchEvent(new Event('panels-geo-changed'))
}
