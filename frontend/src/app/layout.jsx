import './styles.css';
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
    icon: [{ url: '/favicon.ico', sizes: '64x64' }, { url: '/icon.svg', type: 'image/svg+xml' }],
  },
  viewport: 'width=device-width, initial-scale=1, viewport-fit=cover',
};

export default function RootLayout({ children }) {
  const initialLocale = cookies().get('son_locale')?.value === 'hi' ? 'hi' : 'en';
  return (
    <html lang={initialLocale}>
      <body><LocaleProvider initialLocale={initialLocale}><StoreProvider><a href="#main" className="skip-link"><Text>Skip to content</Text></a><Header />{children}<Footer /></StoreProvider></LocaleProvider></body>
    </html>
  );
}

