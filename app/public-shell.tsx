import Link from 'next/link';
import { HeartPulse } from 'lucide-react';
import type { ReactNode } from 'react';
import { PublicMotion } from './public-motion';

const navigation = [
    ['Home', '/'], ['Product', '/product'], ['Industry Insights', '/industry'], ['Solutions', '/solutions'],
    ['Business Value', '/business-value'], ['Market Landscape', '/market'], ['Trust Centre', '/trust'], ['Evaluation', '/evaluation'],
] as const;

export function PublicShell({ children, active }: { children: ReactNode; active?: string }) {
    return <div className="public-site">
        <a className="public-skip" href="#public-main">Skip to content</a>
        <header className="public-header public-header-wide">
            <div className="public-header-top">
                <Link href="/" className="public-brand"><span><HeartPulse size={21} aria-hidden /></span>PriorProof</Link>
                <div className="public-header-actions">
                    <Link href="/workspace?case=new" className="public-button outline">Experience PriorProof</Link>
                    <Link href="/workspace?case=guided" className="public-button primary">Start Guided Demo</Link>
                </div>
            </div>
            <nav aria-label="Public navigation">
                {navigation.map(([label, href]) => <Link key={href} href={href} aria-current={active === href ? 'page' : undefined}>{label}</Link>)}
            </nav>
        </header>
        <main id="public-main" tabIndex={-1}>{children}</main>
        <PublicMotion />
        <footer className="public-footer">
            <span>PriorProof · Fictional demonstration</span>
            <nav aria-label="Footer"><Link href="/journey">Patient journey</Link><Link href="/trust">Privacy and controls</Link><Link href="/business-value#pilot">Pilot enquiry brief</Link></nav>
        </footer>
    </div>;
}
