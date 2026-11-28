import Image from 'next/image';
import Link from 'next/link';
import { ClipboardCheck, FileSearch, HeartPulse, ShieldCheck } from 'lucide-react';
import { PublicShell } from './public-shell';
import { StatGrid } from './industry/stats';
import { industryStats } from './public-content';

const principles = [
    { title: 'Keep the source visible', detail: 'Review a proposed value against the document, page and excerpt that support it.', icon: FileSearch },
    { title: 'Give staff the decision', detail: 'The agent pauses for missing information and staff decide which evidence belongs in the draft.', icon: ClipboardCheck },
    { title: 'Limit disclosure', detail: 'Review masked text, access originals through the protected workspace and inspect the privacy activity record.', icon: ShieldCheck },
];

export default function Landing() {
    return <PublicShell active="/">
        <section className="public-hero marketing-hero">
            <div className="hero-copy">
                <p className="marketing-kicker">Cashless pre-authorization for hospital teams</p>
                <h1>Every change tracked. Every rupee explained.</h1>
                <p className="hero-intro">PriorProof continuously verifies the consistency of insurance authorizations, evolving treatment documentation, hospital bills and insurer settlements through evidence-backed, privacy-conscious and human-supervised intelligence.</p>
                <div className="public-actions">
                    <Link className="public-button primary" href="/workspace?case=new">Experience PriorProof</Link>
                    <Link className="public-button outline" href="/workspace?case=guided">Start Guided Demo</Link>
                </div>
            </div>
            <figure className="hero-visual">
                <Image src="/admissions-illustration.png" alt="Illustration of a hospital staff member helping a patient review paperwork" fill priority sizes="(max-width: 850px) 94vw, 42vw" />
                <figcaption><HeartPulse size={16} aria-hidden /> Illustrative hospital scene</figcaption>
            </figure>
        </section>

        <section className="public-section marketing-story" aria-labelledby="aarav-story">
            <div>
                <p className="marketing-kicker">Aarav Sharma · Fictional patient</p>
                <h2 id="aarav-story">When someone you love is hospitalized, understanding who will pay for their treatment should not become another crisis.</h2>
                <p>At 34, Aarav needs surgery with an estimated treatment cost of ₹85,000. His hospital must prepare a cashless authorization request while his family is trying to understand what the bill may mean for them.</p>
                <div className="public-actions"><Link className="public-button outline" href="/journey">Explore Aarav’s admission</Link><Link className="public-button outline" href="/workspace?case=financial">Open Aarav’s financial journey</Link></div>
            </div>
            <dl className="story-record">
                <div><dt>Insurance identification</dt><dd>Missing from the case. The hospital desk sees which document to request.</dd></div>
                <div><dt>Admission date</dt><dd>Two records disagree. Staff compare both source excerpts and verify the correct value.</dd></div>
                <div><dt>Request preparation</dt><dd>The desk produces a source-linked draft for review. Clinical and emergency care decisions follow the hospital’s clinical processes.</dd></div>
            </dl>
        </section>

        <section className="public-section marketing-section">
            <p className="marketing-kicker">India’s health insurance ecosystem</p>
            <h2>The scale behind the desk</h2>
            <StatGrid stats={industryStats.slice(0, 3)} />
            <p className="marketing-note">Claim volume and payouts describe insurance industry scale. PriorProof’s software opportunity depends on hospital adoption and validated workflow value.</p>
            <Link className="public-button outline" href="/industry">Explore industry insights</Link>
        </section>

        <section className="public-section marketing-section">
            <h2>From scattered records to a reviewable request</h2>
            <p>Keep your existing hospital systems. Add PriorProof as an independent verification and intelligence layer for claim preparation, authorization changes and financial reconciliation.</p>
            <div className="marketing-grid three">{principles.map(({ title, detail, icon: Icon }) => <article className="public-panel marketing-card" key={title}>
                <Icon size={24} aria-hidden /><h3>{title}</h3><p>{detail}</p>
            </article>)}</div>
            <div className="public-actions"><Link className="public-button outline" href="/product">See how PriorProof works</Link>
                <Link className="public-button outline" href="/evaluation">View measured evaluation</Link>
                <Link className="public-button outline" href="/trust#regulatory-readiness">Review privacy and DPDP readiness</Link></div>
        </section>

        <section className="public-section marketing-closing">
            <p>Explore a fictional case or plan a measured hospital-desk pilot.</p>
            <div className="public-actions"><Link className="public-button primary" href="/workspace?case=guided">Start Guided Demo</Link>
                <Link className="public-button outline" href="/business-value#pilot">Pilot enquiry brief</Link></div>
            <h2>Healthcare shouldn&apos;t have to wait for paperwork.</h2>
        </section>
    </PublicShell>;
}
