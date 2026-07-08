import './globals.css';

export const metadata = {
  title: 'playmcd — multiplayer arcade',
  description: 'Real-time multiplayer games with a live leaderboard.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <main className="shell">{children}</main>
      </body>
    </html>
  );
}
