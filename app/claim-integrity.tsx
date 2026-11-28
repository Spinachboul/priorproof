'use client';

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { AgentActivity } from './agent-activity';
import { api } from './client-api';

type Source = { id: string; filename: string | null; page: number; excerpts: Record<string, string>; dateExcerpt: string | null };
type Entry = { id: string; date: string; kind: string; label: string; verification: string; revision: string;
    amounts: Record<string, number>; supersedes: string | null; related: string | null; superseded: boolean; supported: boolean; reviewer: string; source: Source };
type Amount = { paise: number; evidence: string[]; origin: string; rule: string | null; formula: string | null; inputs: string[] };
type ProfileVersion = {
    version: string; parent: string | null; effectiveDate: string; expiryDate: string | null;
    enhancementThresholdPaise: number; approver: string | null; approvedAt: string | null; proposer: string;
};
type Finding = { id: string; category: string; status: string; action: string; paise: number | null; priority: string; evidence: string[] };
type Snapshot = {
    revision: string; stage: string | null; amounts: Record<string, Amount>; events: Entry[]; findings: Finding[];
    demo: { next: number; steps: { label: string }[] } | null;
    paymentHistory: { eventId: string; recordedAt: string; status: string; expected: number | null; received: number | null; evidence: string[] }[];
    review: { current: boolean; reviewedAt: string } | null;
    outcomes: {
        label: string; counts: Record<string, number>;
        records: { id: string; eventId: string; label: string; reason: string; paise: number | null; verified: boolean }[];
        suggestions: { category: string; observations: number; status: string; proposal: string }[];
    };
    profile: {
        name: string; version: string | null; verified: string; source: string | null; requirements: string[];
        editable: boolean; pinnedVersion: string | null; asOf: string; history: ProfileVersion[];
        enhancementThresholdPaise: number | null; agreementReference?: string; policyVersion?: string;
        workflowRequirements: { stage: string; documents: string[]; fields: string[] }[];
    };
};
type Simulation = { before: Record<string, Amount>; after: Record<string, Amount>; requiredEvidence: string; limitations: string; resolved: string[]; remaining: Finding[] };

const labels: Record<string, string> = {
    estimate: 'Estimated treatment cost', authorization: 'Current recorded authorization', authorization_gap: 'Estimate-to-authorization difference',
    bill: 'Latest hospital bill', adjustment: 'Documented contractual adjustment', allowable: 'Contractually allowable amount',
    responsibility: 'Verified patient responsibility', expected: 'Expected insurer reimbursement',
    settlement: 'Recorded settlement advice', received: 'Confirmed insurer payments', outstanding: 'Outstanding on open settlement',
    variance: 'Potential payment variance', payment: 'Recorded payment movement',
    policy_limit: 'Policy limit', copayment: 'Documented co-payment', deductible: 'Documented deductible',
    noncovered: 'Non-covered expenses', deduction: 'Documented insurer deduction',
};
const kinds = {
    admission: 'Admission', estimate: 'Treatment estimate', initial_authorization: 'Initial authorization',
    treatment_update: 'Treatment update and revised estimate', enhancement_request: 'Enhancement request',
    revised_authorization: 'Revised authorization', discharge_authorization: 'Final discharge authorization',
    agreement: 'Hospital-insurer agreement', bill: 'Hospital bill', settlement: 'Settlement advice',
    payment: 'Payment confirmation', reversal: 'Payment reversal', refund: 'Insurer payment refund', resolution: 'Administrative resolution',
};
const versionFamily: Record<string, string> = {
    estimate: 'estimate', treatment_update: 'estimate', initial_authorization: 'authorization',
    revised_authorization: 'authorization', discharge_authorization: 'authorization',
    agreement: 'agreement', bill: 'bill', settlement: 'settlement',
};
const money = (paise?: number | null) => paise == null ? 'Unknown' : new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', minimumFractionDigits: paise % 100 ? 2 : 0,
}).format(paise / 100);
function eventUuid() {
    // getRandomValues also works on the local demo's private-LAN HTTP origin.
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
}
const reports = { report: 'Claim Integrity Report', investigation: 'Financial Discrepancy Investigation Packet', 'patient-summary': 'Patient Financial Summary' };

const patientAmounts = {
    estimate: 'An estimate of the cost of the treatment. It may change as care or billing changes.',
    authorization: 'The amount recorded in a payer authorization. Final coverage depends on the applicable terms and final review.',
    bill: 'The latest total recorded on the hospital bill.',
    adjustment: 'A documented adjustment to the bill under the applicable terms.',
    responsibility: 'The portion supported by verified records. The hospital may revise it if it receives new verified information.',
    received: 'Payments from the insurer the hospital has confirmed so far.',
};

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
    return <section className="card integrity-section" id={id} aria-labelledby={id + '-title'}>
        <h2 id={id + '-title'}>{title}</h2>{children}
    </section>;
}

export function ClaimIntegrity({ cid, revision, documents, download, refresh, reset }: {
    cid: string; revision: string; documents: { id: string; filename: string; pages: number }[];
    download: (path: string, filename: string) => Promise<void>; refresh: () => Promise<void>; reset: () => void;
}) {
    const base = `/api/cases/${cid}/integrity`;
    const [data, setData] = useState<Snapshot | null>(null);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [scenario, setScenario] = useState<Simulation | null>(null);
    const [kind, setKind] = useState('admission');
    const [selectedAmount, selectAmount] = useState('expected');
    const pendingEvent = useRef<{ signature: string; key: string } | null>(null);

    useEffect(() => {
        let active = true;
        api(base).then(snapshot => { if (active) setData(snapshot); })
            .catch(failure => { if (active) setError(failure.message); });
        return () => { active = false; };
    }, [base, revision]);

    async function act(operation: () => Promise<void>) {
        setBusy(true);
        setError('');
        try { await operation(); } catch (failure) { setError((failure as Error).message); }
        finally { setBusy(false); }
    }

    const post = (route: string, body: object, method: 'POST' | 'PUT' = 'POST') => api(base + route, {
        method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const confirm = (body: object = {}) => ({ expectedRevision: data?.revision, staffConfirmed: true, ...body });
    const update = async (next: Snapshot) => {
        setScenario(null);
        setData(next);
        await refresh();
    };
    const openSource = (source: Source) => act(() => download(`/api/cases/${cid}/documents/${source.id}/file`, source.filename || 'source.pdf'));
    function record(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const details = {
            kind, documentId: form.get('document'), page: Number(form.get('page')),
            supersedes: form.get('supersedes') || null, related: form.get('related') || null,
        };
        const signature = JSON.stringify(details);
        if (pendingEvent.current?.signature !== signature) pendingEvent.current = { signature, key: eventUuid() };
        const eventKey = pendingEvent.current.key;
        void act(async () => {
            const next = await post('/events', confirm({ eventKey, ...details }));
            pendingEvent.current = null;
            await update(next);
        });
    }
    function runScenario(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const value = String(form.get('amount') || '');
        const match = /^(\d{1,10})(?:\.(\d{1,2}))?$/.exec(value);
        if (!match) { setError('Enter an INR amount with up to two decimal places.'); return; }
        const paise = Number(match[1]) * 100 + Number((match[2] || '').padEnd(2, '0'));
        void act(async () => setScenario(await post('/simulate', { expectedRevision: data?.revision, action: form.get('action'), paise })));
    }

    if (!data) return error ? <p role="alert">{error}</p> : <p role="status">Loading claim integrity…</p>;
    const { amounts, events, demo, findings } = data;
    const currentAuth = events.find(item => amounts.authorization?.evidence.includes(item.id));
    const previousAuth = events.find(item => item.id === currentAuth?.supersedes);
    const selected = amounts[selectedAmount] ? selectedAmount : Object.keys(amounts)[0];
    const currentScenario = data.revision === revision ? scenario : null;
    const eventSources = (ids: string[]) => events.filter(entry => ids.includes(entry.id));

    const evidence = (entry: Entry, quotes = true) => <div className="integrity-source" key={entry.id}>
        <strong>{entry.label}</strong> · {entry.verification} · {entry.date}
        {entry.source.filename && <button type="button" className="btn small" onClick={() => void openSource(entry.source)}>Download source · p. {entry.source.page}</button>}
        {quotes && Object.values(entry.source.excerpts).map(quote => <code key={quote}>{quote}</code>)}
        {quotes && entry.source.dateExcerpt && <code>{entry.source.dateExcerpt}</code>}
    </div>;

    return <div className="integrity-workspace">
        <div className="heading"><div><div className="eyebrow">Hospital operations</div><h1>{demo ? 'Aarav’s Complete Financial Journey' : 'Claim Integrity'}</h1>
            <p className="sub">Trace authorizations, billing and insurer payments to verified case evidence.</p></div></div>
        {error && <p className="notice" role="alert">{error}</p>}
        {demo && <div className="card integrity-demo">
            <strong>Fictional demonstration · Deterministic processing</strong>
            {demo.steps[demo.next] ? <><p>Next evidence: {demo.steps[demo.next].label}</p>
                <button className="btn primary" type="button" disabled={busy} onClick={() => void act(async () =>
                    update(await post('/demo-step', confirm({ step: demo.next }))))}>Verify and record next fictional document</button></> : <p>All fictional documents have been recorded. Review the reports below.</p>}
            <button type="button" className="btn small" disabled={busy} onClick={() => {
                if (window.confirm('Reset only the fictional financial journey and its documents?')) void act(async () => {
                    await api(base + '/demo', { method: 'DELETE' });
                    reset();
                });
            }}>Reset financial journey</button>
        </div>}
        <nav className="integrity-jumps" aria-label="Claim integrity sections">
            {([['lifecycle', 'Lifecycle'], ['drift', 'Authorization'], ['reconciliation', 'Reconciliation'], ['financial-evidence', 'Evidence'], ['simulator', 'What-if'], ['financial-summary', 'Patient summary'], ['outcomes', 'Outcomes'], ['integrity-reports', 'Reports']]).map(([id, title]) => <a key={id} href={'#' + id}>{title}</a>)}
        </nav>
        <AgentActivity caseId={cid} mode="integrity" refresh={refresh}
            navigate={(_, target) => document.getElementById(target || 'lifecycle')?.scrollIntoView()}
            openEvidence={() => document.getElementById('financial-evidence')?.scrollIntoView()} />
        <Section id="lifecycle" title="Claim lifecycle">
            {events.length ? <ol className="integrity-timeline">{events.map(entry => <li key={entry.id}>
                <details><summary><time dateTime={entry.date}>{entry.date}</time> <strong>{entry.label}</strong>
                    <span className={'badge ' + (entry.supported && !entry.superseded ? 'b-green' : 'b-gray')}>{entry.superseded ? 'Superseded' : entry.verification}</span>
                    {Object.values(entry.amounts).map((value, index) => <span className="integrity-money" key={index}>{money(value)}</span>)}</summary>
                    {evidence(entry)}<p className="muted">Recorded by {entry.reviewer} · Case revision {entry.revision}</p>
                    {entry.supersedes && <p>Supersedes {events.find(item => item.id === entry.supersedes)?.label || 'a prior case record'}.</p>}
                    {entry.related && <p>Linked to the original payment confirmation.</p>}
                </details>
            </li>)}</ol> : <p>Start by recording admission evidence. The original preparation workflow remains available in Documents and Review Evidence.</p>}
            {!demo && <details><summary>Verify structured evidence from an uploaded document</summary>
                <p>Use a case document with the matching structured record type, effective date and labelled INR amounts. Review the original page and confirm financial processing in Case privacy before recording it.</p>
                <form className="integrity-form" onSubmit={record}>
                    <label>Record type<select value={kind} onChange={event => setKind(event.target.value)}>{Object.entries(kinds).map(([key, title]) => <option key={key} value={key}>{title}</option>)}</select></label>
                    <label>Source document<select name="document" required defaultValue=""><option value="" disabled>Select an uploaded document</option>{documents.map(doc => <option key={doc.id} value={doc.id}>{doc.filename}</option>)}</select></label>
                    <label>Source page<input name="page" type="number" min="1" max="40" defaultValue="1" required /></label>
                    {versionFamily[kind] && <label>Current record superseded<select key={kind} name="supersedes" defaultValue=""><option value="">None</option>{events.filter(item => !item.superseded && versionFamily[item.kind] === versionFamily[kind]).map(item => <option key={item.id} value={item.id}>{item.label} · {item.date} · {item.source.filename}</option>)}</select></label>}
                    {(kind === 'refund' || kind === 'reversal') && <label>Original payment<select name="related" required defaultValue=""><option value="" disabled>Select a payment</option>{events.filter(item => item.kind === 'payment' && item.supported).map(item => <option key={item.id} value={item.id}>{item.date} · {money(item.amounts.payment)} · {item.source.filename}</option>)}</select></label>}
                    <label className="integrity-check"><input type="checkbox" required /> I verified the original source and confirmed its applicability to this case.</label>
                    <button type="submit" className="btn primary" disabled={busy || !documents.length}>Record verified event</button>
                </form>
            </details>}
        </Section>
        <Section id="drift" title="Authorization drift">
            <dl className="integrity-metrics">
                <div><dt>Previous authorization</dt><dd>{money(previousAuth?.amounts.authorization)}</dd></div>
                <div><dt>Current authorization</dt><dd>{money(amounts.authorization?.paise)}</dd></div>
                <div><dt>Latest treatment estimate</dt><dd>{money(amounts.estimate?.paise)}</dd></div>
                <div><dt>Estimate-to-authorization difference</dt><dd>{money(amounts.authorization_gap?.paise)}</dd></div>
            </dl>
            <p>Use the difference to review whether an enhancement is needed. Final coverage is determined separately.</p>
            {eventSources(amounts.authorization_gap?.evidence || []).map(item => evidence(item, false))}
            <details><summary>{data.profile.name} · {data.profile.verified}</summary>
                <p>{data.profile.version || 'Generic verification'} {data.profile.source && '· ' + data.profile.source}</p>
                <ul>{data.profile.requirements.map(rule => <li key={rule}>{rule}</li>)}</ul>
                {data.profile.policyVersion && <p>Policy version {data.profile.policyVersion} · {data.profile.agreementReference}</p>}
                {data.profile.enhancementThresholdPaise !== null && <p>Fictional conditional check: flag a positive gap at or above {money(data.profile.enhancementThresholdPaise)} for enhancement review.</p>}
                {data.profile.workflowRequirements.length > 0 && <ul>{data.profile.workflowRequirements.map(stage =>
                    <li key={stage.stage}>{stage.stage}: {stage.fields.join(', ')}</li>)}</ul>}
                {data.profile.editable && <>
                    <h3>Fictional rule versions</h3>
                    <p>Case profile as of {data.profile.asOf} · {data.profile.pinnedVersion || 'Generic verification'}.</p>
                    <ul className="integrity-findings">{data.profile.history.map(version => <li key={version.version}>
                        <strong>{version.version}</strong> · {version.effectiveDate}{version.expiryDate && ` to ${version.expiryDate}`} · threshold {money(version.enhancementThresholdPaise)}
                        <p>{version.approver ? `Approved by ${version.approver}` : `Proposed by ${version.proposer}`}</p>
                        {!version.approver && <button type="button" className="btn small" disabled={busy}
                            onClick={() => void act(async () => setData(await post('/profile/versions/' + encodeURIComponent(version.version) + '/approve', confirm())))}>Approve fictional rule version</button>}
                    </li>)}</ul>
                    <form className="integrity-form" onSubmit={event => {
                        event.preventDefault();
                        const fields = new FormData(event.currentTarget);
                        void act(async () => update(await post('/profile', confirm({ version: fields.get('version') || null }), 'PUT')));
                    }}>
                        <label>Pin an approved version<select name="version" key={data.profile.pinnedVersion} defaultValue={data.profile.pinnedVersion || ''}>
                            <option value="">Generic verification</option>
                            {data.profile.history.filter(version => version.approver).map(version => <option value={version.version} key={version.version}>{version.version}</option>)}
                        </select></label>
                        <button type="submit" className="btn small" disabled={busy}>Apply profile to this case</button>
                    </form>
                    <form className="integrity-form" onSubmit={event => {
                        event.preventDefault();
                        const fields = new FormData(event.currentTarget);
                        const match = /^(\d{1,10})(?:\.(\d{1,2}))?$/.exec(String(fields.get('threshold')));
                        if (!match) { setError('Enter a threshold in INR with up to two decimal places.'); return; }
                        void act(async () => setData(await post('/profile/versions', confirm({
                            parent: fields.get('parent'), effectiveDate: fields.get('effective'),
                            expiryDate: fields.get('expiry') || null,
                            enhancementThresholdPaise: Number(match[1]) * 100 + Number((match[2] || '').padEnd(2, '0')),
                        }))));
                    }}>
                        <label>Base version<select name="parent">{data.profile.history.filter(version => version.approver).map(version =>
                            <option value={version.version} key={version.version}>{version.version}</option>)}</select></label>
                        <label>Enhancement review threshold (₹)<input name="threshold" inputMode="decimal" required /></label>
                        <label>Effective date<input name="effective" type="date" required /></label>
                        <label>Expiry date (optional)<input name="expiry" type="date" /></label>
                        <button type="submit" className="btn small" disabled={busy}>Propose fictional rule correction</button>
                    </form>
                </>}
            </details>
        </Section>
        <Section id="reconciliation" title="Financial reconciliation">
            <div className="integrity-decomposition">
                {([['bill', 'adjustment', 'allowable'], ['allowable', 'responsibility', 'expected'], ['expected', 'received', 'variance']] as const).map((group, index) =>
                    <div className="integrity-equation" key={index}>{group.map(key => <div key={key}><span>{labels[key]}</span>
                        <strong>{key === 'variance' && !amounts.variance ? (amounts.outstanding ? 'Settlement open' : amounts.expected && amounts.received && amounts.expected.paise === amounts.received.paise ? 'Reconciled' : 'Unknown') : money(amounts[key]?.paise)}</strong></div>)}</div>)}
            </div>
            <dl className="integrity-metrics">
                {['settlement', 'outstanding', 'deduction', 'policy_limit', 'copayment', 'deductible', 'noncovered'].map(key => <div key={key}><dt>{labels[key]}</dt><dd>{money(amounts[key]?.paise)}</dd></div>)}
            </dl>
            {findings.length ? <ul className="integrity-findings">{findings.map(finding => <li key={finding.id}>
                <strong>{finding.category}</strong> <span className="badge b-amber">{finding.status}</span>
                {finding.paise !== null && <strong className="integrity-money">{money(finding.paise)}</strong>}
                <p>{finding.action}</p>{eventSources(finding.evidence).map(entry => evidence(entry, false))}
            </li>)}</ul> : <p>{events.length ? 'No open findings from the configured checks on this revision.' : 'Record verified bills, agreement terms and settlement evidence to reconcile amounts.'}</p>}
            {!!data.paymentHistory.length && <details><summary>Payment investigation history</summary>
                <ul className="integrity-findings">{data.paymentHistory.map(record => <li key={record.eventId}>
                    <strong>{record.status}</strong> · {new Date(record.recordedAt).toLocaleString()}
                    {record.expected != null && record.received != null && <p>Expected {money(record.expected)} · Received {money(record.received)} · Difference {money(record.expected - record.received)}</p>}
                    {eventSources(record.evidence).map(item => evidence(item, false))}
                </li>)}</ul>
            </details>}
        </Section>
        <Section id="financial-evidence" title="Financial evidence graph">
            {selected ? <>
                <label className="integrity-field">Financial value<select value={selected} onChange={event => selectAmount(event.target.value)}>{Object.keys(amounts).map(key =>
                    <option key={key} value={key}>{labels[key] || key}</option>)}</select></label>
                <div className="integrity-graph">
                    <div><strong>{labels[selected] || selected} · {money(amounts[selected].paise)}</strong><p>{amounts[selected].origin}</p>
                        {amounts[selected].formula && <p>Calculated from · {amounts[selected].formula} · {amounts[selected].rule}</p>}
                        {amounts[selected].inputs.map(key => <button className="btn small" type="button" key={key} onClick={() => selectAmount(key)}>{labels[key]} · {money(amounts[key]?.paise)}</button>)}</div>
                    {eventSources(amounts[selected].evidence).map(entry => <div key={entry.id}><p>Supported by</p>{evidence(entry)}
                        {entry.supersedes && <p>Previous value: {Object.values(events.find(item => item.id === entry.supersedes)?.amounts || {}).map(money).join(', ') || 'Unknown'}</p>}</div>)}
                </div>
            </> : <p>Verified financial values will appear here with their source pages and calculation history.</p>}
        </Section>
        <Section id="simulator" title="Administrative what-if analysis">
            <p>Explore a proposed correction on a temporary copy. Record verified evidence separately to update the actual case.</p>
            <form className="integrity-form" onSubmit={runScenario}>
                <label>Proposed action<select name="action"><option value="authorization">Receive a revised authorization</option>
                    <option value="estimate">Verify a revised estimate</option><option value="payment">Receive an additional insurer payment</option></select></label>
                <label>Hypothetical amount in INR<input name="amount" inputMode="decimal" required placeholder="90000" /></label>
                <button type="submit" className="btn primary" disabled={busy || !events.length}>Compare hypothetical case</button>
            </form>
            {currentScenario && <div role="status" className="integrity-scenario">
                <h3>Hypothetical comparison</h3><p>Required evidence: {currentScenario.requiredEvidence}.</p>
                <div className="tablewrap"><table><thead><tr><th>Amount</th><th>Recorded</th><th>Hypothetical</th><th>Change</th></tr></thead>
                    <tbody>{Object.keys({ ...currentScenario.before, ...currentScenario.after }).filter(key => currentScenario.before[key]?.paise !== currentScenario.after[key]?.paise).map(key => <tr key={key}>
                        <th scope="row">{labels[key] || key}</th><td>{money(currentScenario.before[key]?.paise)}</td><td>{currentScenario.after[key] ? money(currentScenario.after[key].paise) : key === 'variance' ? 'No variance flagged' : 'Unknown'}</td>
                        <td>{currentScenario.before[key] && currentScenario.after[key] ? money(currentScenario.after[key].paise - currentScenario.before[key].paise) : '—'}</td></tr>)}</tbody></table></div>
                <p>Checks resolved: {currentScenario.resolved.join(', ') || 'None'}. Remaining: {currentScenario.remaining.map(item => item.category).join(', ') || 'None'}.</p>
                <p>{currentScenario.limitations}</p>
            </div>}
        </Section>
        <Section id="financial-summary" title="Patient financial summary preview">
            <p>Staff-controlled preview · {data.review?.current ? 'Current revision reviewed' : 'Requires staff review'}.</p>
            <div className="integrity-patient">{Object.entries(patientAmounts).map(([key, description]) => <div key={key}>
                <strong>{labels[key]} · {money(amounts[key]?.paise)}</strong>
                <p>{description}</p>{amounts[key] && <p className="muted">{key === 'estimate' ? 'Estimated · source reviewed' : 'Verified against recorded evidence'} · {eventSources(amounts[key].evidence).map(entry => `${entry.label} p. ${entry.source.page}`).join(', ')}</p>}
            </div>)}</div>
            <p>{findings.length ? 'Staff are reviewing outstanding questions. Insurer payment differences are investigated separately from your verified responsibility.' : 'Any newly verified information may change this summary.'}</p>
        </Section>
        <Section id="outcomes" title="Outcome intelligence">
            <p>{data.outcomes.label}. Use staff observations to review what should be checked next time.</p>
            {demo && <form className="integrity-form" onSubmit={event => {
                event.preventDefault();
                const fields = new FormData(event.currentTarget);
                void act(async () => setData(await post('/outcomes', confirm({
                    eventId: fields.get('outcome-event'), category: fields.get('outcome-category'), reason: fields.get('outcome-reason'),
                }))));
            }}>
                <label>Verified outcome evidence<select name="outcome-event" required defaultValue=""><option value="" disabled>Select evidence</option>
                    {events.filter(entry => entry.supported).map(entry => <option key={entry.id} value={entry.id}>{entry.date} · {entry.label} {Object.values(entry.amounts).map(money).join(', ')}</option>)}
                </select></label>
                <label>Outcome category<select name="outcome-category">
                    <option value="additional-payment">Additional payment received</option>
                    <option value="administrative-resolution">Administrative issue resolved</option>
                    <option value="full-settlement">Full settlement recorded</option>
                    <option value="payment-disputed">Payment disputed</option>
                    <option value="clarification-requested">Clarification requested</option>
                </select></label>
                <label>Documented reason<select name="outcome-reason">
                    <option>Verified payment confirmation</option><option>Staff resolution</option>
                    <option>Settlement follow-up</option><option>Documentation review</option>
                </select></label>
                <label className="integrity-check"><input type="checkbox" required /> I reviewed the evidence for this fictional outcome.</label>
                <button type="submit" className="btn primary" disabled={busy || !events.length}>Record simulated outcome</button>
            </form>}
            {data.outcomes.records.length ? <ul className="integrity-findings">{data.outcomes.records.map(outcome => <li key={outcome.id}>
                <strong>{outcome.label}</strong> · {outcome.reason} · {outcome.verified ? 'Verified synthetic source' : 'Source unavailable'}
                {outcome.paise != null && <span className="integrity-money">{money(outcome.paise)}</span>}
                {eventSources([outcome.eventId]).map(entry => evidence(entry, false))}
            </li>)}</ul> : <p>No simulated outcomes have been recorded.</p>}
            {data.outcomes.suggestions.length > 0 && <><h3>Suggested verification improvements</h3>
                {data.outcomes.suggestions.map(suggestion => <p className="notice" key={suggestion.category}>{suggestion.proposal} {suggestion.status}.</p>)}</>}
        </Section>
        <Section id="integrity-reports" title="Review and export reports">
            <p>{data.review?.current ? `Staff confirmation recorded ${new Date(data.review.reviewedAt).toLocaleString()}.` : 'Review the visible case evidence, findings and patient breakdown before exporting this revision.'}</p>
            <div className="integrity-report-actions">
                <button className="btn primary" type="button" disabled={busy || !events.length || data.review?.current} onClick={() =>
                    void act(async () => setData(await post('/review', confirm())))}>Confirm staff review</button>
                {Object.entries(reports).map(([slug, name]) => <button type="button" className="btn small" disabled={busy || !data.review?.current} key={slug}
                    onClick={() => void act(() => download(`${base}/${slug}.pdf?revision=${encodeURIComponent(data.revision)}`, `priorproof-${slug}.pdf`))}>Download {name}</button>)}
            </div>
        </Section>
    </div>;
}
