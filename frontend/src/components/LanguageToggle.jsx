'use client';
import { useLocale } from './LocaleProvider';
import Icon from './Icon';
export default function LanguageToggle() {
  const { locale, setLocale } = useLocale();
  const label = locale === 'hi' ? 'भाषा: हिंदी। अंग्रेज़ी में बदलें' : 'Language: English. Switch to Hindi';
  return <div className="language-toggle" translate="no"><button type="button" lang={locale} aria-label={label} title={label} aria-pressed={locale === 'hi'} onClick={() => setLocale(locale === 'hi' ? 'en' : 'hi')}><Icon name="globe" size={24} /><span>{locale === 'hi' ? 'हिंदी' : 'En'}</span></button></div>;
}
