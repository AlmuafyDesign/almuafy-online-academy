import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export type Language = 'bn' | 'en'

type LanguageContextValue = { language: Language; toggleLanguage: () => void }
const LanguageContext = createContext<LanguageContextValue | null>(null)

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(() => {
    try { return localStorage.getItem('almuafy-language') === 'en' ? 'en' : 'bn' } catch { return 'bn' }
  })
  useEffect(() => {
    try { localStorage.setItem('almuafy-language', language) } catch { /* Language selection still works for this visit. */ }
    document.documentElement.lang = language === 'bn' ? 'bn' : 'en'
    document.documentElement.dir = 'ltr'
    document.title = language === 'bn'
      ? 'আলমুয়াফী অনলাইন একাডেমি | জ্ঞান, আমল ও আখলাক'
      : 'Almuafy Online Academy | Learn with Knowledge, Grow with Wisdom'
    document.querySelector('meta[name="description"]')?.setAttribute('content', language === 'bn'
      ? 'আলমুয়াফী অনলাইন একাডেমি — জ্ঞান, আমল ও আখলাকের পথে মানসম্মত অনলাইন শিক্ষা।'
      : 'Learn with knowledge, practice, and good character at Almuafy Online Academy.')
  }, [language])
  const value = useMemo(() => ({ language, toggleLanguage: () => setLanguage(current => current === 'bn' ? 'en' : 'bn') }), [language])
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useLanguage() {
  const value = useContext(LanguageContext)
  if (!value) throw new Error('useLanguage must be used inside LanguageProvider')
  return value
}

export function LanguageToggle() {
  const { language, toggleLanguage } = useLanguage()
  const nextLanguage = language === 'bn' ? 'English' : 'বাংলা'
  return <button className="language-toggle" type="button" onClick={toggleLanguage} aria-label={language === 'bn' ? 'Switch language to English' : 'বাংলা ভাষায় বদলান'} title={language === 'bn' ? 'Switch to English' : 'বাংলায় বদলান'}><span aria-hidden="true">◎</span><b>{nextLanguage}</b></button>
}
