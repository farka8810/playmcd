import './globals.css';
import { Press_Start_2P, Pixelify_Sans } from 'next/font/google';

// Blocky arcade font for the big title; a readable pixel font for headings/labels.
const pixelTitle = Press_Start_2P({ weight: '400', subsets: ['latin'], variable: '--font-pixel-title', display: 'swap' });
const pixelUi = Pixelify_Sans({ subsets: ['latin'], variable: '--font-pixel-ui', display: 'swap' });

export const metadata = {
  title: 'Merge Archers — Kingdom Defense',
  description: 'Defend the kingdom wall with royal archers. Merge, promote, survive the siege — live leaderboard.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${pixelTitle.variable} ${pixelUi.variable}`}>
      <body>
        <main className="shell">{children}</main>
      </body>
    </html>
  );
}
