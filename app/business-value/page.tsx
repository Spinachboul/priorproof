import type { Metadata } from 'next';
import Link from 'next/link';
import { PublicShell } from '../public-shell';
import { FeasibilityCalculator, RevenueCalculator, RoiCalculator } from './calculators';

export const metadata: Metadata = { title: 'Business Value | PriorProof', description: 'Estimate hypothetical hospital desk capacity and explore commercial scenarios.' };

const valueDrivers = [
    ['Desk capacity', 'Less time collecting and retyping the same facts could free staff for review, coordination and other casework. Measure the full task, including corrections and approval.'],
    ['Request quality and rework', 'A requirements checklist, visible conflicts and linked source evidence could help staff prepare more complete drafts and reduce avoidable follow-ups.'],
    ['Revenue cycle', 'More complete submissions may help address one source of administrative delay. Test clarification frequency and time to submission separately from decisions and collections.'],
    ['Local inference economics', 'Local Ollama can run without a per-request model API fee. Include hardware, operations, OCR, maintenance, staffing and upgrades in any comparison.'],
    ['Privacy and accountability', 'Authenticated originals, masked text previews, audit activity and human sign-off give reviewers a clearer record of what was checked and used.'],
];

const commercialOptions = [
    ['Hospital subscriptions', 'Recurring B2B software access for hospital teams.'],
    ['Enterprise on-premises licensing', 'A license for a hospital-managed installation.'],
    ['Usage-based pricing', 'An option tied to case or document volume.'],
    ['HIS integration', 'Implementation services for a hospital information system.'],
    ['Maintenance and support', 'Annual support and maintenance for deployments.'],
    ['White-label distribution', 'A possible licensing channel through healthcare software partners.'],
];

const roadmap = [
    ['Cashless pre-authorization', 'Current prototype scope'],
    ['Discharge authorization', 'Proposed'],
    ['Insurer clarification management', 'Proposed'],
    ['Claims documentation intelligence', 'Proposed'],
    ['Healthcare revenue cycle management', 'Proposed'],
];

export default function BusinessValuePage() {
    return <PublicShell active="/business-value">
        <section className="public-section marketing-intro">
            <p className="marketing-kicker">Business Value</p>
            <h1>How much preparation time could a hospital recover?</h1>
            <p>Model the value of staff capacity, then identify what a pilot would need to measure before a hospital buys.</p>
        </section>
        <section className="public-section marketing-section" id="roi">
            <h2>Hospital workflow ROI calculator</h2>
            <p>Adjust the hypothetical inputs. The default case uses 25 minutes of manual preparation and 10 minutes with assistance and staff review.</p>
            <RoiCalculator />
        </section>
        <section className="public-section marketing-section">
            <h2>What to measure in a pilot</h2>
            <div className="marketing-grid three">{valueDrivers.map(([title, detail]) => <article className="public-panel marketing-card" key={title}><h3>{title}</h3><p>{detail}</p></article>)}</div>
            <p><Link href="/trust">Review the current privacy controls and production requirements</Link></p>
        </section>
        <section className="public-section marketing-section" id="feasibility">
            <h2>Commercial feasibility for a shadow pilot</h2>
            <p>Explore first-year staff capacity, possible avoidable losses and implementation costs separately. Validate each assumption against hospital records and existing controls.</p>
            <FeasibilityCalculator />
        </section>
        <section className="public-section marketing-section" id="commercial">
            <h2>Proposed commercial model</h2>
            <div className="marketing-grid three">{commercialOptions.map(([title, detail]) => <article className="public-panel marketing-card" key={title}><h3>{title}</h3><p>{detail}</p></article>)}</div>
            <h3 className="marketing-subheading">Bottom-up revenue scenario</h3>
            <RevenueCalculator />
        </section>
        <section className="public-section marketing-section">
            <h2>Product expansion roadmap</h2>
            <ol className="marketing-roadmap">{roadmap.map(([stage, status]) => <li key={stage}><strong>{stage}</strong><span>{status}</span></li>)}</ol>
        </section>
        <section className="public-section marketing-closing" id="pilot">
            <h2>Plan a hospital desk pilot</h2>
            <p>Use the brief to discuss measurement, privacy and readiness with your hospital team. This website currently offers a downloadable brief for offline discussion.</p>
            <div className="public-actions"><a className="public-button primary" href="/pilot/priorproof-pilot-enquiry.txt" download>Download pilot enquiry brief</a>
                <Link className="public-button outline" href="/workspace?case=guided">Start Guided Demo</Link></div>
        </section>
    </PublicShell>;
}
