import './globals.css';
import { Press_Start_2P, Pixelify_Sans } from 'next/font/google';
import BgMusic from '@/components/BgMusic';

// Blocky arcade font for the big title; a readable pixel font for headings/labels.
const pixelTitle = Press_Start_2P({ weight: '400', subsets: ['latin'], variable: '--font-pixel-title', display: 'swap' });
const pixelUi = Pixelify_Sans({ subsets: ['latin'], variable: '--font-pixel-ui', display: 'swap' });

const TITLE = 'Merge Archers — Kingdom Defense';
const DESC =
  'Defend the kingdom wall with royal archers. Merge to promote, buy upgrades, fight three rotating bosses and chain kill-combos — free in the browser, with a live global leaderboard.';

export const metadata = {
  title: TITLE,
  description: DESC,
  // Used to resolve the social-share images to absolute URLs. Set
  // NEXT_PUBLIC_SITE_URL to the deployed origin in production (see render.yaml).
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'),
  openGraph: {
    title: TITLE,
    description: DESC,
    type: 'website',
    images: ['/assets/bg/castle.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESC,
    images: ['/assets/bg/castle.png'],
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${pixelTitle.variable} ${pixelUi.variable}`}>
      <body>
        <BgMusic />
        <main className="shell">{children}</main>
      </body>
    </html>
  );
}
