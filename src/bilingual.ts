import type { Language } from './language'

export function bi(bangla: string, english: string, language: Language) {
  return language === 'en' ? english : bangla
}
