import type { Metadata } from 'next';
import Link from 'next/link';
import { PublicShell } from '../public-shell';
import { WorkflowExplorer, type WorkflowStage } from '../workflow-explorer';
import { ClaimModeChart, StatGrid } from './stats';
import { externalCases, industryStats, officialSources, receivablesDisclosure } from '../public-content';

export const metadata: Metadata = { title: 'Industry Insights | PriorProof', description: 'The documentation gaps behind cashless pre-authorization in India.' };

const cashlessProcess: WorkflowStage[] = [
    { title: 'Patient admission', scope: 'Hospital care team', detail: 'The hospital records the admission and follows its own clinical processes. Administrative authorization is separate from emergency care.' },
    { title: 'Document collection', scope: 'PriorProof scope', inScope: true, detail: 'Collect admission notes, clinical records, estimates and insurance identification. Staff can see what is missing before preparing a draft.' },
    { title: 'Verification', scope: 'PriorProof scope', inScope: true, detail: 'Compare proposed values to original excerpts, reconcile dates and other conflicts, and review sensitive information before disclosure.' },
    { title: 'Request preparation', scope: 'PriorProof scope', inScope: true, detail: 'The agent checks requirements, pauses for staff input, and produces an evidence-linked draft after staff approval.' },
    { title: 'Submission', scope: 'Hospital or TPA', detail: 'Authorized staff use their established submission channel. The PriorProof demonstration supports a local simulation.' },
    { title: 'Insurer decision', scope: 'Insurer', detail: 'The insurer applies policy terms, may ask for clarification, and retains responsibility for authorization and coverage decisions.' },
];

const problems = [
    ['Fragmented records', 'A hospital desk may have to gather scans, admission notes, estimates and insurance details from different people or systems, then re-enter information in the request.'],
    ['Gaps and contradictions', 'A missing document or conflicting admission date can trigger clarification. Staff may need to return to the source and repeat checks across versions.'],
    ['Financial uncertainty', 'While the hospital prepares documents and the insurer reviews coverage, families can be unclear about the expected bill or how much might be paid cashless.'],
    ['Confidentiality and evidence', 'Extra copies and unnecessary identifiers can increase disclosure risk. An AI-proposed value should be traceable to a source and reviewed before staff use it.'],
];

export default function Industry() {
    return <PublicShell active="/industry">
        <section className="public-section marketing-intro">
            <p className="marketing-kicker">Industry Insights</p>
            <h1>What happens before a cashless request reaches the insurer?</h1>
            <p>Hospital teams assemble records and check what the evidence says while families wait for clarity about costs and coverage.</p>
        </section>
        <section className="public-section marketing-section">
            <h2>Where the work gets stuck</h2>
            <div className="marketing-grid two">{problems.map(([title, body]) => <article className="public-panel marketing-card" key={title}><h3>{title}</h3><p>{body}</p></article>)}</div>
        </section>
        <section className="public-section marketing-section">
            <h2>Why track the claim after authorization?</h2>
            <p>When the estimate or bill changes, hospital staff need to check what the payer authorized, what was billed, and what actually arrived. Outstanding payments, documented deductions, and unresolved differences call for different follow-up. The patient’s verified responsibility has its own evidence.</p>
            <article className="public-panel marketing-card">
                <h3>Receivables and working capital</h3>
                <p className="stat-period">{receivablesDisclosure.period}</p>
                <p>{receivablesDisclosure.text} This is a consolidated accounting disclosure. The size and cause of insurer-specific payment variances require separate evidence.</p>
                <a href={receivablesDisclosure.url}>{receivablesDisclosure.title}</a>
            </article>
        </section>
        <section className="public-section marketing-section">
            <h2>Follow a cashless request</h2>
            <p>Select a stage to see who handles it and what PriorProof supports.</p>
            <WorkflowExplorer label="Cashless insurance process" stages={cashlessProcess} />
        </section>
        <section className="public-section marketing-section">
            <h2>Reported volumes and decision timelines</h2>
            <StatGrid stats={industryStats} />
            <p className="marketing-note">The IRDAI figures describe insurance industry activity and exclude personal accident and travel cover. AB-PMJAY figures are cumulative scheme figures for a different period. These measures describe scale and should not be added together or used as PriorProof’s software addressable market.</p>
            <ClaimModeChart />
            <p className="marketing-note">Also available as an <a href={officialSources.irdaReportCopy}>IRDAI report copy hosted by the Life Insurance Council</a>. A <a href={officialSources.parliamentaryAnswer}>Ministry of Finance reply to Parliament</a> cites both IRDAI timelines.</p>
        </section>
        <section className="public-section marketing-section">
            <h2>What research and reporting document</h2>
            <p>These researchers and reporters describe administrative problems in specific settings. Follow each source for its findings and context.</p>
            <div className="marketing-grid three">{externalCases.map(item => <article className="public-panel case-study" key={item.title}>
                <p className="stat-period">{item.source} · {item.date}</p><h3>{item.title}</h3>
                <p>{item.summary}</p>
                <dl><dt>Consequence</dt><dd>{item.consequence}</dd><dt>Where PriorProof could help</dt><dd>{item.relevance}</dd>
                    <dt>Limit</dt><dd>{item.limit}</dd></dl>
                <a href={item.url}>Read the original {item.kind}</a>
            </article>)}</div>
            <div className="public-actions"><Link className="public-button primary" href="/workspace?case=guided">Start Guided Demo</Link></div>
        </section>
    </PublicShell>;
}
