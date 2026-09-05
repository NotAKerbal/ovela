import type { Metadata } from 'next';
import './globals.css';
import { ThemeProvider } from '@/components/theme';
import { themeScript } from '@/lib/theme-script';
import { Providers } from '@/components/providers';
export const metadata: Metadata = { title: 'Ovela', description: 'A personal home for your applications.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head><body><ThemeProvider><Providers>{children}</Providers></ThemeProvider></body></html>;
}
