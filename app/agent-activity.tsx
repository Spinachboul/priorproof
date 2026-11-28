'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { api } from './client-api';

type Task = { id: string; kind: string; subject: string; field_ids: string[] };
type AgentRun = {
    run_id: string;
    objective: string;
    current_task: string;
    revision: string;
    current_revision: string;
    status: string;
    interrupted: boolean;
    input_received: boolean;
    packet?: string;
    tasks: Task[];
    evidence: { id: string; name: string; document_id: string | null; page: number | null; status: string; review: string }[];
    history: { tool: string; summary: string; selection: string; at: string }[];
    errors: string[];
    warnings: string[];
};

const names: Record<string, string> = {
    inspect_case: 'Inspect case', extract_document: 'Extract document fields', verify_evidence: 'Check source evidence',
    check_requirements: 'Check required documents', detect_conflicts: 'Detect conflicts',
    evaluate_readiness: 'Evaluate readiness', request_human_input: 'Request staff input',
    generate_draft_packet: 'Prepare draft packet',
};
const labels: Record<string, string> = {
    missing_document: 'Upload document', missing_field: 'Supply source or staff-verified value',
    conflict: 'Resolve conflict', verify_evidence: 'Review evidence', approve_draft: 'Approve PDF draft preparation',
};

export function AgentActivity({ caseId, refresh, navigate, openEvidence }: {
    caseId: string;
    refresh: () => Promise<void>;
    navigate: (page: string, target?: string) => void;
    openEvidence: (fieldId: string) => void;
}) {
    const [run, setRun] = useState<AgentRun | null>(null);
    const [loaded, setLoaded] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [qrCode, setQrCode] = useState('');
    const base = `/api/cases/${caseId}/agent/runs`;

    useEffect(() => {
        if (busy) return;
        let active = true;
        let timer: ReturnType<typeof setTimeout>;
        async function poll() {
            try {
                const result = await api(base + '/latest');
                if (active) { setRun(result); setLoaded(true); }
            } catch (failure) {
                if (active) setError((failure as Error).message);
            } finally {
                if (active) timer = setTimeout(poll, 4000);
            }
        }
        void poll();
        return () => { active = false; clearTimeout(timer); };
    }, [base, busy]);

    async function act(action: 'start' | 'resume' | 'cancel', task?: Task) {
        setBusy(true);
        setError('');
        try {
            if (task && run) {
                await api(`${base}/${run.run_id}/input`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ task_id: task.id, revision: run.current_revision, confirmed: true }),
                });
            }
            const path = action === 'start' ? base : `${base}/${run?.run_id}/${action}`;
            setRun(await api(path, { method: 'POST' }));
            await refresh();
        } catch (failure) {
            setError((failure as Error).message);
        } finally {
            setBusy(false);
        }
    }

    async function download() {
        if (!run?.packet) return;
        try {
            const response = await api(run.packet);
            const url = URL.createObjectURL(await response.blob());
            const link = document.createElement('a');
            link.href = url;
            link.download = 'PriorProof_PreAuthorization_Draft.pdf';
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (failure) {
            setError((failure as Error).message);
        }
    }

    async function toggleQr() {
        if (qrCode) { setQrCode(''); return; }
        try {
            setQrCode(await QRCode.toDataURL(caseId, { width: 220, margin: 2 }));
        } catch {
            setError('The case QR could not be generated.');
        }
    }

    const active = run?.status === 'waiting' || run?.status === 'running';
    return <section className="card agent-panel" aria-labelledby="agent-heading">
        <div className="agent-head">
            <div><h2 id="agent-heading" className="paneltitle">Agent Activity</h2>
                <p className="sub">{run?.objective || 'Prepare an evidence-backed pre-authorization draft for staff review.'}</p></div>
            <div className="agent-actions">
                {loaded && !active && <button className="btn primary" disabled={busy} onClick={() => act('start')}>{busy ? 'Working…' : 'Start preparation'}</button>}
                {active && <button className="btn small" disabled={busy} onClick={() => act('cancel')}>Cancel run</button>}
                <button className="btn small" onClick={toggleQr}>{qrCode ? 'Hide case QR' : 'Show case QR'}</button>
            </div>
        </div>
        {qrCode && <div className="agent-qr"><img src={qrCode} width={220} height={220} alt="Scan this case from the signed-in PriorProof mobile app" /><p>Open Scan case QR in the signed-in mobile app.</p></div>}
        {error && <p role="alert" className="agent-error">{error}</p>}
        {run && <>
            <p role="status"><strong>{({ waiting: 'Waiting for staff', running: 'Running', completed: 'Draft prepared', stopped: 'Stopped', cancelled: 'Cancelled' })[run.status] || run.status}</strong> · {run.current_task}</p>
            {[...run.errors, ...run.warnings].map(message => <p key={message} className="notice">{message}</p>)}
            {run.interrupted && <div>
                <h3 className="paneltitle">Staff tasks</h3>
                <ul className="agent-list">{run.tasks.map(task => <li key={task.id}>
                    <div><strong>{task.subject}</strong><div className="muted">{labels[task.kind]}</div></div>
                    <div className="agent-actions">
                        {task.kind !== 'approve_draft' && <button className="btn small" onClick={() => {
                            if (task.kind === 'missing_document') navigate('Documents', 'upload-documents');
                            else if (task.field_ids.length) navigate('Review & evidence', `field-${task.field_ids[0]}`);
                            else navigate('Review & evidence', 'staff-field');
                        }}>Open task</button>}
                        <button className="btn small" disabled={busy || (task.kind === 'approve_draft'
                            ? run.current_revision !== run.revision
                            : run.current_revision === run.revision)} onClick={() => act('resume', task)}>
                            {task.kind === 'approve_draft' ? 'Approve draft preparation' : 'Confirm update and resume'}
                        </button>
                    </div>
                </li>)}</ul>
            </div>}
            {(run.input_received || run.status === 'running' || (run.status === 'waiting' && !run.interrupted)) &&
                <button className="btn small" disabled={busy} onClick={() => act('resume')}>Resume agent</button>}
            {run.packet && <button className="btn primary" onClick={download}>Download draft PDF</button>}
            {run.history.length > 0 && <details className="agent-details"><summary>Completed tool calls ({run.history.length})</summary>
                <ol>{run.history.map(entry => <li key={entry.at}><strong>{names[entry.tool]}</strong> · {entry.summary} <span className="muted">({entry.selection})</span></li>)}</ol>
            </details>}
            {run.evidence.length > 0 && <details className="agent-details"><summary>Supporting evidence ({run.evidence.length})</summary>
                <ul>{run.evidence.map(ref => <li key={ref.id}>
                    {ref.name} · {ref.status} · {ref.review}{ref.page ? ` · page ${ref.page}` : ''}{' '}
                    {ref.document_id && <button className="btn small" onClick={() => openEvidence(ref.id)}>Open source</button>}
                </li>)}</ul>
            </details>}
        </>}
    </section>;
}
