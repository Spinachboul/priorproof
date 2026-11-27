import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'PriorProof | Cashless pre-authorization', description: 'Evidence-linked pre-authorization workflow for hospital teams', manifest: '/manifest.json' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
