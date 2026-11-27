'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '../client-api';

type Config = {
    provider: string; model: string | null; localInference: boolean; transmission: string;
    authentication: string; authorization: string; humanReview: string; provenance: string;
    retention: string; deletion: boolean;
};
type Summary = { id: string; patientName: string; patientId: string };
type Event = {
    id: string; actor_id: string; session_id: string | null; case_id: string;
    action: string; object_id: string | null; timestamp: string; outcome: string;
};

export default function TrustControls() {
    const [config, setConfig] = useState<Config | null>(null);
    const [cases, setCases] = useState<Summary[]>([]);
    const [caseId, setCaseId] = useState('');
    const [events, setEvents] = useState<Event[]>([]);
    const [message, setMessage] = useState('');
    const [status, setStatus] = useState('Checking session…');
    const [activityError, setActivityError] = useState('');
    const [confirmation, setConfirmation] = useState('');
    const [busy, setBusy] = useState(false);
    const [pendingCase, setPendingCase] = useState('');
    const [transport, setTransport] = useState('');

    useEffect(() => {
        let active = true;
        const configuredAPI = process.env.NEXT_PUBLIC_API_URL;
        setTransport(window.location.protocol === 'https:' && (!configuredAPI || configuredAPI.startsWith('https:'))
            ? 'HTTPS in use for the browser. Check the backend’s TLS certificate and hosting configuration.'
            : 'Browser/API traffic can use unencrypted HTTP in the local demo.');
        if (!sessionStorage.getItem('priorproof-token')) {
            setStatus('Sign in to verify the running controls and access case activity.');
            return;
        }
        const clearSession = () => {
            setConfig(null);
            setCases([]);
            setEvents([]);
            setCaseId('');
            setStatus('Sign in to verify the running controls and access case activity.');
        };
        window.addEventListener('priorproof-logout', clearSession);
        Promise.all([api('/api/trust'), api('/api/cases')]).then(([control, list]) => {
            if (!active) return;
            setConfig(control);
            setCases(list);
            const selection = new URLSearchParams(window.location.search).get('case');
            if (list.some((entry: Summary) => entry.id === selection)) setCaseId(selection!);
        }).catch(error => {
            if (active && sessionStorage.getItem('priorproof-token')) setStatus(error.message);
        });
        return () => {
            active = false;
            window.removeEventListener('priorproof-logout', clearSession);
        };
    }, []);

    useEffect(() => {
        setEvents([]);
        setConfirmation('');
        setActivityError('');
        if (!caseId) return;
        let active = true;
        api(`/api/cases/${caseId}/activity`).then(data => {
            if (active) setEvents(data);
        }).catch(error => { if (active) setActivityError(error.message); });
        return () => { active = false; };
    }, [caseId]);

    async function deleteCase(id: string) {
        setBusy(true);
        try {
            const result = await api(`/api/cases/${id}`, { method: 'DELETE' });
            setCases(cases.filter(item => item.id !== id));
            setCaseId('');
            setPendingCase(result.cleanupPending ? id : '');
            setMessage(result.cleanupPending ? `Case removed. ${result.cleanupPending} file(s) await cleanup.` : 'Case and its application-managed files were deleted.');
        } catch (error) {
            setMessage((error as Error).message);
        } finally {
            setBusy(false);
        }
    }

    const rows = config && [
        ['AI provider', config.provider === 'ollama' ? `Ollama · ${config.model}` : config.provider === 'mock' ? 'Deterministic demo rules' : config.provider],
        ['Inference', config.localInference ? 'Configured for loopback inference' : config.provider === 'mock' ? 'No model used' : 'Model processing unavailable'],
        ['Document transmission', config.transmission], ['Browser transport', transport],
        ['Authentication', config.authentication], ['Case authorization', config.authorization],
        ['Human review', config.humanReview], ['Evidence provenance', config.provenance],
        ['Retention', config.retention], ['Case deletion', config.deletion ? 'Available to the case owner' : 'Unavailable'],
    ];
    return <div className="public-section trust-grid">
        <section className="public-panel"><h2>Running controls</h2>
            {rows ? <dl className="trust-controls">{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl> :
                <><p role="status">{status}</p><Link href="/workspace" className="public-button outline">Open workspace to sign in</Link></>}
        </section>
        {config && <section className="public-panel">
            <h2>Case activity</h2><p>Events record the actor, session, object and outcome. Medical text is excluded.</p>
            <label htmlFor="trust-case">Select a case</label>
            <select id="trust-case" className="fieldinput" value={caseId} disabled={busy} onChange={event => { setMessage(''); setCaseId(event.target.value); }}>
                <option value="">Choose a case</option>
                {cases.map(item => <option key={item.id} value={item.id}>{item.patientName || 'Case record'} · {item.patientId || item.id.slice(0, 8)}</option>)}
            </select>
            {activityError && <p role="alert">{activityError}</p>}
            {caseId && events.length > 0 && <div className="tablewrap trust-events"><table><thead><tr><th scope="col">Action</th><th scope="col">Actor / session</th><th scope="col">Object</th><th scope="col">Time</th><th scope="col">Outcome</th></tr></thead>
                <tbody>{events.map(event => <tr key={event.id}><td>{event.action}</td><td>{event.actor_id}<br /><code title={event.session_id || undefined}>{event.session_id?.slice(0, 8) || '—'}</code></td>
                    <td><code title={event.object_id || undefined}>{event.object_id?.slice(0, 8) || '—'}</code></td>
                    <td><time dateTime={event.timestamp}>{new Date(event.timestamp).toLocaleString()}</time></td><td>{event.outcome}</td></tr>)}</tbody></table></div>}
            {caseId && events.length === 0 && !activityError && <p>There are no recorded events for this case yet.</p>}
            {caseId && <details className="trust-delete"><summary>Delete selected case</summary>
                <p>This permanently removes the case’s database records and queues deletion of application-managed files. Downloaded copies and backups may still exist.</p>
                <form onSubmit={event => { event.preventDefault(); if (confirmation === 'DELETE') deleteCase(caseId); }}>
                    <label htmlFor="delete-confirmation">Type DELETE to confirm</label>
                    <input id="delete-confirmation" className="fieldinput" value={confirmation} onChange={event => setConfirmation(event.target.value)} />
                    <button className="public-button outline" disabled={busy || confirmation !== 'DELETE'}>Delete case and files</button>
                </form></details>}
            {message && <p role="status">{message}</p>}
            {pendingCase && <button className="public-button outline" disabled={busy} onClick={() => deleteCase(pendingCase)}>Retry remaining file cleanup</button>}
        </section>}
        <section className="public-panel">
            <h2>Security limits</h2><p>One demo account shares access to its cases. Local storage is not encrypted by PriorProof. Deletion cannot recall exports or remove copies from backups, snapshots or disk recovery tooling.</p><p>The demo has no independent compliance assessment.</p>
        </section>
    </div>;
}
