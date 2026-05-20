import type { Metadata } from 'next';
import { Noto_Sans_SC, Space_Grotesk } from 'next/font/google';
import './globals.css';

const notoSans = Noto_Sans_SC({
  subsets: ['latin'],
  variable: '--font-noto',
  weight: ['400', '500', '700', '800'],
});

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space',
  weight: ['500', '700'],
});

export const metadata: Metadata = {
  title: '数字病理辅助诊断系统',
  description: '商业化架构下的数字病理辅助诊断工作台',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon-96x96.png', sizes: '96x96', type: 'image/png' },
    ],
    shortcut: ['/favicon.ico'],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  manifest: '/site.webmanifest',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className={`${notoSans.variable} ${spaceGrotesk.variable}`}>{children}</body>
    </html>
  );
}