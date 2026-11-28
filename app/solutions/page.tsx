import type { Metadata } from 'next';
import Link from 'next/link';
import { PublicShell } from '../public-shell';
import { customerSegments } from '../public-content';

export const metadata: Metadata = { title: 'Solutions | PriorProof', description: 'Evidence-linked request preparation for hospital desks and the people who rely on them.' };

export default function SolutionsPage() {
    return <PublicShell active="/solutions">
        <section className="public-section marketing-intro">
            <p className="marketing-kicker">Solutions</p>
            <h1>Make the next step clearer for everyone.</h1>
            <p>PriorProof is designed for hospital insurance desks. Better documentation could also help the insurers, administrators and families who depend on the same records.</p>
        </section>
        <section className="public-section marketing-section">
            <h2>Who the workflow could help</h2>
            <div className="marketing-grid two">{customerSegments.map(segment => <article className="public-panel marketing-card" key={segment.title}>
                <h3>{segment.title}</h3>
                <p>{segment.description}</p>
                {segment.organizations && <><h4>{segment.relationship}</h4><p>{segment.organizations.join(' · ')}</p></>}
            </article>)}</div>
            <p className="marketing-note">Organization names illustrate prospective customers and ecosystem participants. These examples imply no partnerships, contracts or endorsements.</p>
            <div className="public-actions">
                <Link className="public-button primary" href="/business-value">Estimate hospital workflow value</Link>
                <Link className="public-button outline" href="/business-value#pilot">Pilot enquiry brief</Link>
            </div>
        </section>
    </PublicShell>;
}
