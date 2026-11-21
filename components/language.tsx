'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { translate, translateMessage, type Language, type TranslationValues } from '../lib/translations';

const STORAGE_KEY = 'voltroar-language';
const LanguageContext = createContext<{
  language: Language;
  setLanguage: (language: Language) => void;
  t: (source: string, values?: TranslationValues) => string;
  message: (source: string) => string;
} | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, update] = useState<Language>('ka');
  useEffect(() => {
    try {
      if (window.localStorage.getItem(STORAGE_KEY) === 'en') update('en');
    } catch { /* Language switching remains available for this visit. */ }
  }, []);
  useEffect(() => { document.documentElement.lang = language; }, [language]);
  const setLanguage = useCallback((next: Language) => {
    update(next);
    try { window.localStorage.setItem(STORAGE_KEY, next); } catch { /* Storage can be blocked. */ }
  }, []);
  const t = useCallback((source: string, values?: TranslationValues) => translate(language, source, values), [language]);
  const message = useCallback((source: string) => translateMessage(language, source), [language]);
  return <LanguageContext.Provider value={{ language, setLanguage, t, message }}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('Language provider is missing.');
  return context;
}

export function LanguageSwitch() {
  const { language, setLanguage, t } = useLanguage();
  return (
    <div className="language-switch" role="group" aria-label={t('Language')}>
      <button type="button" lang="ka" aria-label="ქართული" aria-pressed={language === 'ka'} onClick={() => setLanguage('ka')}>ქარ</button>
      <button type="button" lang="en" aria-label="English" aria-pressed={language === 'en'} onClick={() => setLanguage('en')}>EN</button>
    </div>
  );
}
