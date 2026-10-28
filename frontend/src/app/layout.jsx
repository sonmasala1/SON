import './globals.css';
import './customer-auth.css';
import './localization.css';
import './readability.css';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { StoreProvider } from '@/components/StoreProvider';
import { LocaleProvider } from '@/components/LocaleProvider';
import { Text } from '@/components/LocalizedText';
import { cookies } from 'next/headers';

export const metadata = {
  title: 'SON MASALA',
  description: 'SON MASALA — हर स्वाद में अपनापन. Discover Indian spices, kitchen stories, and recipes made for the meals you love.',
  icons: {
    icon: '/icon.svg',
  },
};

export default function RootLayout({ children }) {
  const initialLocale = cookies().get('son_locale')?.value === 'hi' ? 'hi' : 'en';
  return (
    <html lang={initialLocale}>
      <body><LocaleProvider initialLocale={initialLocale}><StoreProvider><a href="#main" className="skip-link"><Text>Skip to content</Text></a><Header />{children}<Footer /></StoreProvider></LocaleProvider></body>
    </html>
  );
}

