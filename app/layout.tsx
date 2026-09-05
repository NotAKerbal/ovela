import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Mosaic Haven', description: 'A personal home for your applications.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
