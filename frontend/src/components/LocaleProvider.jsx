'use client';
import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { translate, validationMessage } from '@/lib/i18n';

const LocaleContext = createContext({ locale: 'en', setLocale: () => {}, t: value => value });
export function LocaleProvider({ children, initialLocale = 'en' }) {
  const [locale, updateLocale] = useState(initialLocale);
  const pathname = usePathname();
  useEffect(() => {
    let saved;
    try { saved = localStorage.getItem('son-masala-locale'); } catch { /* Cookie preference works when browser storage is unavailable. */ }
    const cookie = document.cookie.match(/(?:^|; )son_locale=(en|hi)(?:;|$)/)?.[1];
    updateLocale(cookie || (saved === 'hi' || saved === 'en' ? saved : initialLocale));
    const synchronize = event => { if (event.key === 'son-masala-locale') updateLocale(event.newValue === 'hi' ? 'hi' : 'en'); };
    window.addEventListener('storage', synchronize);
    return () => window.removeEventListener('storage', synchronize);
  }, [initialLocale]);
  const setLocale = useCallback(next => {
    if (!['en', 'hi'].includes(next)) return;
    updateLocale(next);
    try { localStorage.setItem('son-masala-locale', next); } catch { /* Language still works for this visit. */ }
    document.cookie = `son_locale=${next}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale;
    const title = { '/': 'Home', '/shop': 'All Spices', '/cart': 'Your shopping bag', '/checkout': 'Checkout', '/login': 'Sign In', '/account': 'Customer profile', '/wishlist': 'Your wishlist', '/about': 'Our Story', '/contact': 'Contact', '/policies': 'Store information.', '/recipes': 'THE RECIPE DIARY' }[pathname];
    if (title) document.title = `SON MASALA · ${translate(title, locale)}`;
    document.querySelectorAll('input, select, textarea').forEach(element => element.setCustomValidity(''));
    function invalid(event) {
      const element = event.target;
      if (typeof element.setCustomValidity === 'function') element.setCustomValidity(validationMessage(element.validity, locale));
    }
    const input = event => event.target.setCustomValidity?.('');
    document.addEventListener('invalid', invalid, true); document.addEventListener('input', input, true);
    return () => { document.removeEventListener('invalid', invalid, true); document.removeEventListener('input', input, true); };
  }, [locale, pathname]);
  const value = useMemo(() => ({ locale, setLocale, t: (message, options) => translate(message, locale, options) }), [locale, setLocale]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}
export const useLocale = () => useContext(LocaleContext);
