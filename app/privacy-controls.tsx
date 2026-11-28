'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { api } from './client-api';

const NOTICE = 'PP-NOTICE-2026-11-v1';
const purposeOptions = { preauthorization: 'Prepare a pre-authorization draft', 'workflow-training': 'Fictional workflow training' };
const categoryOptions = { 'patient-identification': 'Patient and admission identifiers', 'clinical-records': 'Clinical records',
    insurance: 'Insurance details', 'cost-estimates': 'Cost estimates' };
const recipientOptions = { 'hospital-desk': 'Hospital desk', 'authorized-reviewers': 'Authorized reviewers',
    'insurer-or-tpa': 'Intended insurer or TPA recipient' };
const basisOptions = { 'synthetic-demonstration': 'Synthetic demonstration', 'consent-recorded-externally': 'Consent reported as recorded elsewhere',
    'certain-legitimate-use': 'Certain legitimate use selected for organizational review', 'pending-review': 'Basis pending organizational review' };

type Authorization = { purpose: string; categories: string[]; recipients: string[]; basis: string; noticeVersion: string;
    staffConfirmed: boolean; synthetic: boolean; confirmedAt: string | null; actor: string };
type Finding = { category: string; count: number; maskedValue: string; classification: string };
type Review = { decision: string; reviewed_at: string; actor_id: string };
type PrivacyDocument = { id: string; category: string; pages: number; findings: Finding[]; staffReview: Review | null };
type Preview = { page: number; text: string; findings: Finding[]; review: Review | null };
type Lifecycle = { createdAt: string; lastProcessingAt: string | null; reviewDate: string | null;
    policyReference: string; legalHold: boolean; eligible: boolean; restriction: string | null };
type PrivacyRequest = { id: string; kind: string; created_at: string; status: string; outcome: string | null; resolved_at: string | null; resolved_by: string | null };
type Profile = { authorization: Authorization | null; lifecycle: Lifecycle; documents: PrivacyDocument[]; requests: PrivacyRequest[] };

const dateTime = (value: string | null) => value ? new Date(value).toLocaleString() : 'Not recorded';
const optionLabel = (options: Record<string, string>, key: string) => options[key] ?? key;
const json = (method: string, data: object) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });

export function processingAuthorization(form: HTMLFormElement) {
    const data = new FormData(form);
    const categories = data.getAll('privacyCategory');
    const recipients = data.getAll('privacyRecipient');
    if (!categories.length || !recipients.length) throw new Error('Select at least one data category and intended recipient.');
    return { purpose: data.get('privacyPurpose'), categories, recipients, basis: data.get('privacyBasis'),
        noticeVersion: NOTICE, staffConfirmed: data.has('privacyConfirmed'), synthetic: true };
}

export function ProcessingFields({ original }: { original?: Authorization | null }) {
    return <fieldset className="formsection privacy-fields">
        <legend>Patient privacy and processing purpose</legend>
        <p>Use fictional data only. The confirmation records a staff action. Patient consent and any other processing basis require separate organizational evidence. <Link href="/trust#patient-privacy" target="_blank">Privacy notice ({NOTICE})</Link></p>
        <div className="formgrid">
            <label>Purpose<select className="fieldinput" name="privacyPurpose" defaultValue={original?.purpose ?? 'preauthorization'}>
                {Object.entries(purposeOptions).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select></label>
            <label>Processing basis recorded by staff<select className="fieldinput" name="privacyBasis" defaultValue={original?.basis ?? 'synthetic-demonstration'}>
                {Object.entries(basisOptions).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select></label>
        </div>
        <fieldset><legend>Data categories</legend>{Object.entries(categoryOptions).map(([value, label]) =>
            <label key={value}><input name="privacyCategory" type="checkbox" value={value} defaultChecked={original?.categories.includes(value) ?? true} /> {label}</label>)}</fieldset>
        <fieldset><legend>Intended recipients</legend>{Object.entries(recipientOptions).map(([value, label]) =>
            <label key={value}><input name="privacyRecipient" type="checkbox" value={value} defaultChecked={original?.recipients.includes(value) ?? value !== 'insurer-or-tpa'} /> {label}</label>)}</fieldset>
        <label><input name="privacyConfirmed" type="checkbox" required /> I confirm these processing details for this fictional case.</label>
    </fieldset>;
}

export function PrivacyPanel({ caseId, revision }: { caseId: string; revision?: string }) {
    const [open, setOpen] = useState(false);
    return <details className="card privacy-panel" onToggle={event => setOpen(event.currentTarget.open)}>
        <summary>Case privacy and confidentiality</summary>
        {open && <PrivacyDetails key={caseId} caseId={caseId} revision={revision} />}
    </details>;
}

function PrivacyDetails({ caseId, revision }: { caseId: string; revision?: string }) {
    const [profile, setProfile] = useState<Profile>();
    const [documentId, setDocumentId] = useState('');
    const [preview, setPreview] = useState<Preview>();
    const [pending, setPending] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [retry, setRetry] = useState(0);
    const base = `/api/cases/${caseId}/privacy`;
    const selected = profile?.documents.find(doc => doc.id === documentId);

    useEffect(() => {
        let active = true;
        api(base).then(result => { if (active) { setProfile(result); setError(''); } })
            .catch(failure => { if (active) setError(failure.message); });
        return () => { active = false; };
    }, [base, revision, retry]);

    async function act(task: () => Promise<void>, success?: string) {
        setPending(true);
        setError('');
        setMessage('');
        try {
            await task();
            if (success) setMessage(success);
        } catch (failure) {
            setError((failure as Error).message);
        } finally {
            setPending(false);
        }
    }

    async function loadPreview(id: string, page = 1) {
        setDocumentId(id);
        setPreview(undefined);
        if (id) await act(async () => setPreview(await api(`${base}/documents/${id}?page=${page}`)));
    }

    async function save(event: FormEvent<HTMLFormElement>, task: (form: HTMLFormElement) => Promise<void>, confirmed: string) {
        event.preventDefault();
        const form = event.currentTarget;
        await act(async () => { await task(form); setProfile(await api(base)); }, confirmed);
    }

    async function openOriginal() {
        const tab = window.open('about:blank', '_blank');
        if (!tab) { setError('Allow a new tab to open the authorized original.'); return; }
        tab.opener = null;
        await act(async () => {
            try {
                const response = await api(`/api/cases/${caseId}/documents/${documentId}/file`);
                const url = URL.createObjectURL(await response.blob());
                tab.location.replace(url);
                setTimeout(() => URL.revokeObjectURL(url), 60000);
            } catch (failure) { tab.close(); throw failure; }
        });
    }

    async function downloadSummary() {
        await act(async () => {
            const summary = await api(base + '/summary');
            const url = URL.createObjectURL(new Blob([JSON.stringify(summary, null, 2)], { type: 'application/json' }));
            const link = document.createElement('a');
            link.href = url;
            link.download = 'PriorProof-privacy-summary.json';
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        });
    }

    return <div className="privacy-content">
        {error && <p role="alert">{error}</p>}
        {message && <p role="status">{message}</p>}
        {!profile && (error ? <button className="btn small" onClick={() => { setError(''); setRetry(value => value + 1); }}>Retry privacy details</button> : <p role="status">Loading privacy details…</p>)}
        {profile && <>
            <section>
                <h3>Processing information</h3>
                {profile.authorization ? <p>{optionLabel(purposeOptions, profile.authorization.purpose)} · {optionLabel(basisOptions, profile.authorization.basis)} · Notice {profile.authorization.noticeVersion} · {profile.authorization.staffConfirmed ? `Staff confirmed ${dateTime(profile.authorization.confirmedAt)}` : 'Seeded fictional record awaiting staff confirmation'}</p> : <p>No processing authorization record. Record details where appropriate.</p>}
                {profile.authorization && <dl><dt>Data categories</dt><dd>{profile.authorization.categories.map(key => optionLabel(categoryOptions, key)).join(', ')}</dd><dt>Intended recipients</dt><dd>{profile.authorization.recipients.map(key => optionLabel(recipientOptions, key)).join(', ')}</dd></dl>}
                <details><summary>Record staff confirmation</summary>
                    <form onSubmit={event => void save(event, form => api(base + '/authorization', json('PUT', processingAuthorization(form))), 'Staff confirmation recorded.')}>
                        <ProcessingFields original={profile.authorization} />
                        <button className="btn small" disabled={pending}>Save processing information</button>
                    </form>
                </details>
            </section>
            <section>
                <h3>Document confidentiality</h3>
                {profile.documents.length ? <label>Document to screen <select className="fieldinput" value={selected ? documentId : ''} disabled={pending} onChange={event => void loadPreview(event.target.value)}>
                    <option value="">Select a document</option>
                    {profile.documents.map((doc, index) => <option key={doc.id} value={doc.id}>{doc.category} · document {index + 1}</option>)}
                </select></label> : <p>Upload a document to screen its extracted text.</p>}
                {selected && <>
                    <p>{selected.staffReview ? `${selected.staffReview.decision === 'reviewed' ? 'Privacy reviewed' : 'Privacy follow-up required'} · ${dateTime(selected.staffReview.reviewed_at)}` : 'Staff privacy review pending'}</p>
                    <ul>{selected.findings.map(finding => <li key={finding.category}>{finding.maskedValue} · {finding.count} · {finding.classification}</li>)}</ul>
                    {!selected.findings.length && <p>No identifiers matched the configured rules. Staff should still inspect the document.</p>}
                    <p>Masked preview covers detected patterns in extracted text. The original and exported clinical packet may contain identifiers.</p>
                    {preview && <>
                        <label>Page <select className="fieldinput" value={preview.page} disabled={pending} onChange={event => void loadPreview(documentId, Number(event.target.value))}>
                            {Array.from({ length: Math.max(selected.pages, 1) }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}
                        </select></label>
                        <pre className="masked-preview">{preview.text || 'No readable text is available for this page.'}</pre>
                    </>}
                    <div className="agent-actions">
                        <button type="button" className="btn small" disabled={pending} onClick={openOriginal}>Open authorized original</button>
                        {preview && ['reviewed', 'follow-up-required'].map(decision => <button key={decision} type="button" className="btn small" disabled={pending} onClick={() => act(async () => {
                            await api(`${base}/documents/${documentId}/review`, json('PUT', { decision }));
                            setProfile(await api(base));
                        }, 'Document privacy decision recorded.')}>{decision === 'reviewed' ? 'Mark privacy reviewed' : 'Flag privacy follow-up'}</button>)}
                    </div>
                </>}
            </section>
            <section>
                <h3>Data lifecycle</h3>
                <dl><dt>Created</dt><dd>{dateTime(profile.lifecycle.createdAt)}</dd><dt>Last processing attempt</dt><dd>{dateTime(profile.lifecycle.lastProcessingAt)}</dd>
                    <dt>Retention review date</dt><dd>{profile.lifecycle.reviewDate || 'Not scheduled'}</dd><dt>Policy reference</dt><dd>{profile.lifecycle.policyReference}</dd>
                    <dt>Application deletion</dt><dd>{profile.lifecycle.eligible ? 'Available after confirming applicable obligations' : profile.lifecycle.restriction}</dd></dl>
                <form key={`${profile.lifecycle.reviewDate}:${profile.lifecycle.legalHold}`} onSubmit={event => void save(event, form => {
                    const data = new FormData(form);
                    return api(base + '/retention', json('PUT', { reviewDate: data.get('reviewDate') || null,
                        legalHold: data.has('legalHold'), confirmHoldRelease: data.has('confirmHoldRelease') }));
                }, 'Retention review details saved.')}>
                    <label>Review date <input className="fieldinput" name="reviewDate" type="date" defaultValue={profile.lifecycle.reviewDate ?? ''} /></label>
                    <label><input type="checkbox" name="legalHold" defaultChecked={profile.lifecycle.legalHold} /> Record a legal hold</label>
                    {profile.lifecycle.legalHold && <label><input type="checkbox" name="confirmHoldRelease" /> I confirm the applicable organizational hold has been cleared if removing it.</label>}
                    <button className="btn small" disabled={pending}>Save retention details</button>
                </form>
            </section>
            <section>
                <h3>Privacy request register</h3>
                <p>Records an administrative request and its status. Staff handle identity verification, response, and legal fulfillment separately.</p>
                <form onSubmit={event => void save(event, form => api(base + '/requests', json('POST', { kind: new FormData(form).get('kind') })), 'Privacy request recorded.')}>
                    <label>Request type <select className="fieldinput" name="kind">{['access', 'correction', 'erasure', 'grievance'].map(kind => <option key={kind}>{kind}</option>)}</select></label>
                    <button className="btn small" disabled={pending}>Record request</button>
                </form>
                {!profile.requests.length && <p>No requests recorded.</p>}
                {profile.requests.map(request => <div className="privacy-request" key={request.id}>
                    <p><strong>{request.kind}</strong> · {dateTime(request.created_at)} · {request.status}{request.outcome && ` · ${request.outcome} · ${dateTime(request.resolved_at)}`}</p>
                    {request.status !== 'closed' && <form onSubmit={event => void save(event, form => {
                        const data = new FormData(form);
                        const outcome = data.get('outcome');
                        return api(`${base}/requests/${request.id}`, json('PUT', { status: outcome ? 'closed' : 'in-review', outcome: outcome || null }));
                    }, 'Request status updated.')}>
                        <label>Action <select className="fieldinput" name="outcome"><option value="">Mark in review</option>
                            <option value="answered-externally">Close · answered externally</option>
                            <option value="referred">Close · referred</option>
                            <option value="restricted">Close · restriction applies</option>
                            <option value="withdrawn">Close · withdrawn</option>
                        </select></label>
                        <button className="btn small" disabled={pending}>Update request</button>
                    </form>}
                </div>)}
            </section>
            <button type="button" className="btn small" disabled={pending} onClick={downloadSummary}>Download privacy and processing summary</button>
        </>}
    </div>;
}
