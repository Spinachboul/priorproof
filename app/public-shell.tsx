import Link from 'next/link';
import { HeartPulse } from 'lucide-react';
import type { ReactNode } from 'react';

export function PublicShell({ children }: { children: ReactNode }) {
    return <div className="public-site">
        <header className="public-header">
            <Link href="/" className="public-brand"><span><HeartPulse size={21} aria-hidden /></span>PriorProof</Link>
            <nav aria-label="Public navigation">
                <Link href="/journey">Patient journey</Link>
                <Link href="/evaluation">Evaluation</Link>
                <Link href="/trust">Trust Centre</Link>
            </nav>
            <Link href="/workspace" className="public-button outline">Open workspace</Link>
        </header>
        <main>{children}</main>
        <footer className="public-footer"><span>PriorProof · Fictional demonstration</span><Link href="/trust">Privacy and controls</Link></footer>
    </div>;
}
