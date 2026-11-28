import type { Metadata } from 'next';
import Link from 'next/link';
import { PublicShell } from '../public-shell';
import { competitors } from '../public-content';

export const metadata: Metadata = { title: 'Market Landscape | PriorProof', description: 'Publicly documented health insurance workflow offerings and where PriorProof fits.' };

export default function MarketPage() {
    return <PublicShell active="/market">
        <section className="public-section marketing-intro">
            <p className="marketing-kicker">Market Landscape</p>
            <h1>Where PriorProof fits in the claims workflow</h1>
            <p>Claims platforms, administrators and preparation tools serve different parts of the insurance process. The most direct fit for PriorProof is the hospital desk preparing evidence before submission.</p>
        </section>
        <section className="public-section marketing-section">
            <h2>Publicly documented offerings</h2>
            <p>Each description summarizes the provider’s own published material. Performance and feature parity would require independent testing.</p>
            {[['India', undefined], ['United States', 'US']].map(([title, market]) => <div key={title}>
                <h3 className="marketing-subheading">{title}</h3>
                <div className="marketing-grid two">{competitors.filter(offering => offering.market === market).map(offering => <article className="public-panel marketing-card" key={offering.name}>
                    <h3>{offering.name}</h3><p>{offering.focus}</p>
                    <p className="stat-period">Reviewed {offering.reviewed}</p><a href={offering.url}>{offering.name} product information</a>
                    {offering.supportingSource && <p><a href={offering.supportingSource}>Optum product information</a></p>}
                </article>)}</div>
            </div>)}
        </section>
        <section className="public-section marketing-section">
            <h2>A focus on what the draft can show</h2>
            <p>The market already spans post-authorization monitoring, denial prevention, remittance operations and contract-based checks. PriorProof’s positioning hypothesis is that hospital desks may benefit from an independent verification layer that combines version history, source-linked calculations, what-if review, and a staff-reviewed patient explanation. Local inference, mobile capture and privacy controls support that workflow. Customer discovery and a controlled pilot are needed to test the distinction.</p>
            <div className="public-actions"><Link className="public-button primary" href="/product">Explore the workflow</Link><Link className="public-button outline" href="/trust#regulatory-readiness">Read regulatory readiness</Link></div>
        </section>
    </PublicShell>;
}
