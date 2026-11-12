export function readTabMemory<T>(key: string, fallback: T): T {
  try {
    const stored = sessionStorage.getItem(key)
    return stored == null ? fallback : JSON.parse(stored) as T
  } catch {
    return fallback
  }
}

export function writeTabMemory(key: string, value: unknown) {
  try { sessionStorage.setItem(key, JSON.stringify(value)) } catch { /* Session memory is optional when browser storage is unavailable. */ }
}

export function clearTabMemory(key: string) {
  try { sessionStorage.removeItem(key) } catch { /* Session memory is optional when browser storage is unavailable. */ }
}
