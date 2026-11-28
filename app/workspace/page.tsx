'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { EvidenceGraph, ReadinessPanel } from '../intelligence';
import Link from 'next/link';
import { Activity, AlertTriangle, ArrowRight, BriefcaseMedical, Check, CheckCircle2, ChevronRight, ClipboardCheck, Clock3, Download, FileText, FolderOpen, HeartPulse, LayoutDashboard, Plus, RefreshCw, ShieldCheck, Trash2, Upload, Wifi, X } from 'lucide-react';

import { api } from '../client-api';
import { AgentActivity } from '../agent-activity';
type Case = { id: string; patientName: string; patientId: string; age?: number; gender: string; hospitalName: string; admissionDate: string; department: string; insurer: string; policyNumber: string; policyType: string; tpa: string; reason: string; diagnosis: string; treatment: string; estimatedCost?: number; status: string; createdAt: string; updatedAt: string; submission?: any; documents?: Doc[]; fields?: Field[]; checklist?: any[]; conflicts?: any[]; reviewSummary?: any };
type Doc = { id: string; filename: string; category: string; pages: number; status: string };
type Field = { id: string; group_name: string; name: string; value: string; original: string; source_doc: string; source_name: string; page: number; evidence: string; confidence: number; review: string; origin: string; provider?: string; evidenceStatus?: string };
const categories = ['Admission notes', 'Clinical notes', 'Diagnostic reports', 'Treatment plans', 'Prescriptions', 'Cost estimates', 'Insurance policy', 'Insurance identification', 'Other supporting documents'];
async function fetchFile(path: string) {
    const response = await api(path);
    return URL.createObjectURL(await response.blob());
}
async function downloadFile(path: string, filename: string) {
    const url = await fetchFile(path);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
}
const badge = (s: string) => <span className={'badge ' + (s === 'Ready for Submission' || s === 'Completed' || s === 'Verified' ? 'b-green' : s === 'Missing Information' || s === 'Rejected' ? 'b-red' : s === 'Needs Review' || s === 'Unreviewed' ? 'b-amber' : s === 'Processing' ? 'b-blue' : 'b-gray')}>{s}</span>;
export default function Home() {
    const [cases, setCases] = useState<Case[]>([]), [current, setCurrent] = useState<Case | null>(null), [page, setPage] = useState('Dashboard'), [loading, setLoading] = useState(true), [provider, setProvider] = useState('mock'), [toast, setToast] = useState(''), [modal, setModal] = useState(false), [processing, setProcessing] = useState(false), [search, setSearch] = useState(''), [authToken, setAuthToken] = useState(''), [authReady, setAuthReady] = useState(false);
    useEffect(() => { setAuthToken(sessionStorage.getItem('priorproof-token') || ''); setAuthReady(true); const logout = () => { setAuthToken(''); setCurrent(null); setCases([]); setPage('Dashboard'); setModal(false) }; window.addEventListener('priorproof-logout', logout); return () => window.removeEventListener('priorproof-logout', logout) }, []);
    useEffect(() => {
        if (!authToken) { setLoading(false); return; }
        if (process.env.NODE_ENV === 'production' && window.isSecureContext && 'serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js').catch(() => { });
        }
        let active = true;
        async function loadWorkspace() {
            try {
                const selection = new URLSearchParams(window.location.search).get('case');
                const guided = selection === 'guided';
                const demo = guided || selection === 'aarav'
                    ? await api('/api/demo/aarav', { method: guided ? 'POST' : 'GET' }) : null;
                const [list, health, detail] = await Promise.all([
                    api('/api/cases'), api('/api/health'), demo ? api('/api/cases/' + demo.id) : null,
                ]);
                if (!active) return;
                setCases(list);
                setProvider(health.provider);
                if (detail) { setCurrent(detail); setPage('Case workspace'); }
                if (selection === 'new') setModal(true);
            } catch (error) {
                if (active) setToast((error as Error).message);
            } finally {
                if (active) setLoading(false);
            }
        }
        loadWorkspace();
        return () => { active = false; };
    }, [authToken]);
    useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 3800); return () => clearTimeout(t) }, [toast]);
    const currentId = current?.id;
    useEffect(() => {
        if (!currentId || !authToken) return;
        let active = true;
        let timer: ReturnType<typeof setTimeout>;
        async function pollCase() {
            try {
                const next: Case = await api('/api/cases/' + currentId);
                if (active) setCurrent(current => current?.id === next.id && current.updatedAt < next.updatedAt ? next : current);
            } catch {
                // Existing case/agent actions surface connection errors.
            } finally {
                if (active) timer = setTimeout(pollCase, 4000);
            }
        }
        timer = setTimeout(pollCase, 4000);
        return () => { active = false; clearTimeout(timer); };
    }, [currentId, authToken]);
    const openCase = async (c: Case, pg = 'Case workspace') => { try { const d = await api('/api/cases/' + c.id); setCurrent(d); setPage(pg) } catch (e: any) { setToast(e.message) } };
    const refreshCase = async () => { if (!current) return; const [d, list] = await Promise.all([api('/api/cases/' + current.id), api('/api/cases')]); setCurrent(active => active && active.id === d.id && active.updatedAt <= d.updatedAt ? d : active); setCases(list) };
    const create = async (data: any) => { try { const c = await api('/api/cases', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); setCases([c, ...cases]); setModal(false); setCurrent(await api('/api/cases/' + c.id)); setPage('Documents'); setToast('Case created. Add the supporting records to continue.') } catch (e: any) { setToast(e.message) } };
    const counts = useMemo(() => ({ total: cases.length, review: cases.filter(c => c.status === 'Needs Review').length, missing: cases.filter(c => c.status === 'Missing Information').length, complete: cases.filter(c => c.status === 'Completed').length }), [cases]);
    const menu = [['OVERVIEW', [['Dashboard', LayoutDashboard], ['All cases', FolderOpen]]], ['WORKSPACE', [['Documents', FileText], ['Review & evidence', ClipboardCheck], ['Evidence graph', Activity]]]] as any;
    if (!authReady) return <div className="shell"><div className="empty">Loading…</div></div>;
    if (!authToken) return <Login onLogin={token => { sessionStorage.setItem('priorproof-token', token); setAuthToken(token); setLoading(true) }} />;
    return <div className="shell"><aside className="sidebar"><Link href="/" className="brand workspace-brand"><div className="brandmark"><HeartPulse size={19} /></div>PriorProof</Link><nav>{menu.map(([section, items]: any) => <div key={section}><div className="navlabel">{section}</div>{items.map(([label, Icon]: any) => <button key={label} className={'navbtn ' + (page === label ? 'active' : '')} onClick={() => { if ((['Documents', 'Review & evidence', 'Evidence graph'].includes(label)) && !current) { setToast('Open a case first'); return } setPage(label) }}><Icon size={17} />{label}</button>)}</div>)}</nav><div className="sidebottom"><Link href="/trust">Trust Centre</Link><br /><Link href="/evaluation">Evaluation results</Link><br />Prototype · synthetic data by default<br /><span style={{ display: 'block', marginTop: 9 }}>Local AI provider: <b>{provider === 'ollama' ? 'Ollama' : 'Demo rules'}</b></span><button className="btn small" style={{ marginTop: 10 }} onClick={() => { sessionStorage.removeItem('priorproof-token'); window.dispatchEvent(new Event('priorproof-logout')) }}>Sign out</button></div><div className="mobilemenu"><button className="btn small" onClick={() => setPage('All cases')}>All cases</button><button className="btn small" onClick={() => { sessionStorage.removeItem('priorproof-token'); window.dispatchEvent(new Event('priorproof-logout')) }}>Sign out</button></div></aside>
        <main className="main"><header className="topbar"><div className="crumb">Hospital Operations&nbsp; / &nbsp;<b>{page}</b></div><div className="user"><span className="provider"><Wifi size={14} />{provider === 'ollama' ? 'Ollama · local' : 'Deterministic demo provider'}</span><div className="avatar">HD</div><span>Hospital Desk</span></div></header><div className="content">
            {page === 'Dashboard' && <Dashboard cases={cases} counts={counts} loading={loading} onNew={() => setModal(true)} onOpen={openCase} onAll={() => setPage('All cases')} />}
            {page === 'All cases' && <AllCases cases={cases} search={search} setSearch={setSearch} onOpen={openCase} onNew={() => setModal(true)} />}
            {(page === 'Case workspace' || page === 'Documents' || page === 'Review & evidence' || page === 'Generate Packet' || page === 'Evidence graph') && current && <Workspace key={current.id} c={current} page={page} setPage={setPage} processing={processing} setProcessing={setProcessing} refresh={refreshCase} toast={setToast} provider={provider} />}
            {page === 'Case workspace' && !current && <div className="empty">Choose a case from the dashboard.</div>}
        </div></main>{modal && <CreateModal close={() => setModal(false)} submit={create} />}{toast && <div className="toast" role="status">{toast}</div>}</div>
}

function Login({ onLogin }: { onLogin: (token: string) => void }) { const [key, setKey] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''); return <div className="shell" style={{ display: 'grid', placeItems: 'center', padding: 20 }}><form className="card" style={{ width: 'min(420px,100%)' }} onSubmit={async e => { e.preventDefault(); setBusy(true); setError(''); try { const body = await api('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accessKey: key }) }); onLogin(body.token) } catch (err: any) { setError(err.message) } finally { setBusy(false) } }}><div className="brand"><div className="brandmark"><HeartPulse size={19} /></div>PriorProof</div><h1 style={{ marginTop: 24 }}>Sign in to the demo</h1><Link href="/">Back to PriorProof</Link><p className="sub">Enter the access key configured by the person running this local demo.</p><label htmlFor="access-key">Demo access key</label><input id="access-key" className="fieldinput" type="password" autoComplete="current-password" value={key} onChange={e => setKey(e.target.value)} required style={{ width: '100%', marginTop: 8 }} />{error && <p role="alert" style={{ color: '#a52323' }}>{error}</p>}<button className="btn primary" style={{ width: '100%', justifyContent: 'center', marginTop: 16 }} disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button></form></div> }

function Dashboard({ cases, counts, loading, onNew, onOpen, onAll }: any) { return <><div className="heading"><div><div className="eyebrow">Operations overview</div><h1>Good morning, Hospital Desk</h1><p className="sub">Create Case → Upload Documents → Review Evidence → Generate Packet</p></div><button className="btn primary" onClick={onNew}><Plus size={16} />Create new case</button></div><div className="stats">{[['Total cases', counts.total, BriefcaseMedical, ''], ['Awaiting review', counts.review, Clock3, 'amber'], ['Missing information', counts.missing, AlertTriangle, 'blue'], ['Packets completed', counts.complete, CheckCircle2, 'purple']].map(([l, n, I, col]: any) => <div className="card stat" key={l}><div><div className="statlabel">{l}</div><div className="statnum">{n}</div></div><div className={'staticon ' + col}><I size={18} /></div></div>)}</div><div className="grid2"><div className="card" style={{ padding: 0 }}><div className="sectionhead"><h2 className="paneltitle">Recent cases</h2><button className="btn small" onClick={onAll}>View all <ArrowRight size={14} /></button></div><div className="tablewrap"><table><thead><tr><th>Patient / case</th><th>Admission</th><th>Documents</th><th>Status</th></tr></thead><tbody>{cases.slice(0, 5).map((c: Case) => <tr className="clickrow" key={c.id} onClick={() => onOpen(c)}><td><div className="patient">{c.patientName || 'New patient'}<span className="synthetic">SYNTHETIC</span></div><div className="muted">{c.patientId || c.id.slice(0, 8)}</div></td><td>{c.admissionDate || '—'}</td><td>{(c as any).documentCount ?? 0} files</td><td>{badge(c.status)}</td></tr>)}</tbody></table>{loading && <div className="empty">Loading cases…</div>}{!loading && !cases.length && <div className="empty">No cases yet. Create one to begin.</div>}</div></div><div className="card" style={{ padding: 0 }}><div className="sectionhead"><h2 className="paneltitle">Workflow at a glance</h2><Activity size={17} color="#16857e" /></div>{[['01', 'Create a case', 'Add admission and insurance details'], ['02', 'Upload records', 'PDFs and images accepted'], ['03', 'Process & review', 'Inspect every fact against its source'], ['04', 'Generate a packet', 'Download a staff-reviewed draft']].map(([n, t, s]) => <div className="quick" key={n}><div className="quickicon"><span style={{ fontSize: 11, fontWeight: 700 }}>{n}</span></div><div><strong>{t}</strong><span>{s}</span></div></div>)}<div style={{ padding: '0 18px 18px' }}><div className="notice" style={{ margin: 0 }}>PriorProof assists staff; it does not diagnose, determine coverage, or approve claims.</div></div></div></div><p className="muted" style={{ marginTop: 17 }}>All sample cases and policy requirements are fictional demonstration data.</p></> }

function AllCases({ cases, search, setSearch, onOpen, onNew }: any) { const shown = cases.filter((c: Case) => `${c.patientName} ${c.patientId} ${c.status}`.toLowerCase().includes(search.toLowerCase())); return <><div className="heading"><div><div className="eyebrow">Case management</div><h1>All cases</h1><p className="sub">Browse and continue pre-authorization workspaces.</p></div><button className="btn primary" onClick={onNew}><Plus size={16} />Create new case</button></div><div className="card" style={{ padding: 0 }}><div className="sectionhead"><input className="fieldinput" placeholder="Search patient or status…" value={search} onChange={e => setSearch(e.target.value)} /><span className="muted">{shown.length} cases</span></div><div className="tablewrap"><table><thead><tr><th>Patient / ID</th><th>Hospital</th><th>Admission</th><th>Insurer</th><th>Status</th><th></th></tr></thead><tbody>{shown.map((c: Case) => <tr key={c.id} className="clickrow" onClick={() => onOpen(c)}><td><div className="patient">{c.patientName || 'New patient'}</div><div className="muted">{c.patientId || c.id.slice(0, 8)} <span className="synthetic">SYNTHETIC</span></div></td><td>{c.hospitalName || '—'}</td><td>{c.admissionDate || '—'}</td><td>{c.insurer || '—'}</td><td>{badge(c.status)}</td><td><ChevronRight size={16} /></td></tr>)}</tbody></table>{!shown.length && <div className="empty">No matching cases.</div>}</div></div></> }

function CreateModal({ close, submit }: any) { const [d, setD] = useState<any>({ patientName: '', patientId: '', age: '', gender: '', hospitalName: 'Green Valley Multispecialty Hospital', admissionDate: '', department: '', insurer: '', policyNumber: '', policyType: '', tpa: '', reason: '', diagnosis: '', treatment: '', estimatedCost: '' }); const [busy, setBusy] = useState(false); const change = (k: string, v: any) => setD({ ...d, [k]: v }); const field = (label: string, k: string, type = 'text', required = false) => <div className="formgroup" key={k}><label htmlFor={`case-${k}`}>{label}{required ? ' *' : ''}</label><input id={`case-${k}`} type={type} value={d[k]} required={required} onChange={e => change(k, e.target.value)} /></div>; return <div className="modalback" onClick={close}><div className="modal" onClick={e => e.stopPropagation()}><div className="modalhead"><div><div className="eyebrow">New workspace</div><h2 className="paneltitle">Create pre-authorization case</h2></div><button className="close" onClick={close}><X size={20} /></button></div><form onSubmit={async e => { e.preventDefault(); setBusy(true); await submit({ ...d, age: d.age ? Number(d.age) : null, estimatedCost: d.estimatedCost ? Number(d.estimatedCost) : null }); setBusy(false) }}><div className="formsection"><h3>Patient & admission</h3><div className="formgrid">{field('Patient name', 'patientName', 'text', true)}{field('Patient ID', 'patientId')}{field('Age', 'age', 'number')}{<div className="formgroup"><label htmlFor="case-gender">Gender</label><select id="case-gender" value={d.gender} onChange={e => change('gender', e.target.value)}><option value="">Select</option><option>Female</option><option>Male</option><option>Other</option><option>Prefer not to say</option></select></div>}{field('Hospital name', 'hospitalName', 'text', true)}{field('Admission date', 'admissionDate', 'date')}{field('Department', 'department')}{field('Reason for admission', 'reason')}</div></div><div className="formsection"><h3>Insurance & planned care</h3><div className="formgrid">{field('Insurance provider', 'insurer')}{field('Policy number', 'policyNumber')}{field('Policy type', 'policyType')}{field('TPA name', 'tpa')}{field('Provisional diagnosis', 'diagnosis')}{field('Planned treatment', 'treatment')}{field('Estimated cost (₹)', 'estimatedCost', 'number')}</div></div><div className="notice">Use synthetic or de-identified information for this prototype. Values entered here are staff-provided and are not document-verified.</div><div className="actions"><button className="btn" type="button" onClick={close}>Cancel</button><button className="btn primary" disabled={busy}><Plus size={15} />{busy ? 'Creating…' : 'Create case'}</button></div></form></div></div> }

function Workspace({ c, page, setPage, processing, setProcessing, refresh, toast, provider }: any) {
    const [categoriesByFile, setCategoriesByFile] = useState<Record<number, string>>({}), [files, setFiles] = useState<File[]>([]), [evidence, setEvidence] = useState<any>(null), [editId, setEditId] = useState(''), [editVal, setEditVal] = useState(''), [reason, setReason] = useState(''); const inp = (label: string, v: any) => v || <span style={{ color: '#a5b0b7' }}>Not provided</span>;
    const [uploading, setUploading] = useState(false);
    const [packetBusy, setPacketBusy] = useState(false);
    const [reviewBusy, setReviewBusy] = useState(false);
    const [liveAnalysis, setLiveAnalysis] = useState(false);
    const [manualName, setManualName] = useState('');
    const [manualValue, setManualValue] = useState('');
    const [manualConfirmed, setManualConfirmed] = useState(false);
    const guided = c.patientId === 'DEMO-GUIDED-1024';
    const missingCard = c.checklist?.some((row: { requirement: string; status: string }) =>
        row.requirement === 'Insurance identification' && row.status === 'Missing');
    const [target, setTarget] = useState<{ id: string }>();
    const navigate = (view: string, id?: string) => {
        setPage(view);
        setTarget(id ? { id } : undefined);
    };
    useEffect(() => {
        if (!target) return;
        const element = document.getElementById(target.id);
        if (element instanceof HTMLDetailsElement) element.open = true;
        element?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        element?.focus({ preventScroll: true });
    }, [page, target]);
    const inWorkspace = useRef(true);
    useEffect(() => {
        inWorkspace.current = true;
        return () => { inWorkspace.current = false };
    }, []);
    const [draft, setDraft] = useState<{ url: string; filename: string } | null>(null);
    useEffect(() => () => { if (draft) URL.revokeObjectURL(draft.url) }, [draft]);
    useEffect(() => { setDraft(null) }, [c.updatedAt]);

    const selectFiles = (input: HTMLInputElement) => {
        const chosen = Array.from(input.files || []);
        input.value = '';
        if (files.length + chosen.length > 8) return toast('Select up to 8 files per upload');
        if (chosen.some(file => !/\.(pdf|png|jpe?g)$/i.test(file.name))) return toast('Choose PDF, PNG or JPEG files. For HEIC photos, export a JPEG and try again.');
        setFiles(previous => [...previous, ...chosen]);
    };
    const discardFile = (index: number) => {
        setFiles(files.filter((_, i) => i !== index));
        setCategoriesByFile(Object.fromEntries(Object.entries(categoriesByFile)
            .filter(([i]) => Number(i) !== index)
            .map(([i, category]) => [Number(i) > index ? Number(i) - 1 : Number(i), category])));
    };
    const upload = async () => {
        const form = new FormData();
        files.forEach((file, i) => {
            form.append('files', file);
            form.append('categories', categoriesByFile[i] || 'Other supporting documents');
        });
        setUploading(true);
        try {
            const result = await api(`/api/cases/${c.id}/documents`, { method: 'POST', body: form });
            setFiles([]);
            setCategoriesByFile({});
            toast(`${result.documents.length} document(s) uploaded`);
            await refresh();
        } catch (error: any) {
            toast(error.message);
        } finally {
            setUploading(false);
        }
    };
    const uploadMembership = async () => {
        setUploading(true);
        try {
            const response = await fetch('/evaluation/aarav-membership.pdf');
            if (!response.ok) throw new Error('The fictional sample membership card is unavailable.');
            const form = new FormData();
            form.append('files', await response.blob(), 'Aarav_Fictional_Membership.pdf');
            form.append('categories', 'Insurance identification');
            await api(`/api/cases/${c.id}/documents`, { method: 'POST', body: form });
            await refresh();
            toast('Fictional membership document added. Analyze the current document set.');
        } catch (error) {
            toast((error as Error).message);
        } finally {
            setUploading(false);
        }
    };
    const process = async () => {
        setProcessing(true);
        try {
            const result = await api(`/api/cases/${c.id}/process`, { method: 'POST' });
            toast(result.message);
            for (let i = 0; i < 120; i++) {
                await new Promise(resolve => setTimeout(resolve, 1000));
                const detail = await api(`/api/cases/${c.id}`);
                if (detail.status === 'Processing') continue;
                await refresh();
                if (detail.status === 'Processing Failed') {
                    toast(provider === 'ollama' ? 'Local extraction failed. Check Ollama, its model and the backend log.' : 'Document processing failed. Check the backend log and retry.');
                } else {
                    setLiveAnalysis(true);
                    toast(detail.fields.length ? 'Processing finished. Inspect each field against its evidence.' : 'No supported fields found. Check the document text or OCR status.');
                    if (inWorkspace.current) setPage('Review & evidence');
                }
                return;
            }
            await refresh();
            toast('Processing is still running. Check the case status again shortly.');
        } catch (error: any) {
            toast(error.message);
        } finally {
            setProcessing(false);
        }
    };
    const review = async (field: Field, status: string) => {
        setReviewBusy(true);
        try {
            await api(`/api/cases/${c.id}/review/${field.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ review: status, value: status === 'Edited' ? editVal : undefined }),
            });
            setEditId('');
            await refresh();
            toast(`Field marked ${status.toLowerCase()}`);
        } catch (error: any) {
            toast(error.message);
        } finally {
            setReviewBusy(false);
        }
    };
    const recordStaffValue = async () => {
        if (!manualConfirmed || !manualName || !manualValue.trim()) return;
        setReviewBusy(true);
        try {
            await api(`/api/cases/${c.id}/fields`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: manualName, value: manualValue }),
            });
            setManualValue('');
            setManualConfirmed(false);
            await refresh();
            toast('Staff-reviewed value recorded');
        } catch (error) {
            toast((error as Error).message);
        } finally {
            setReviewBusy(false);
        }
    };
    const showEvidence = async (fid: string) => { try { setEvidence(await api(`/api/cases/${c.id}/evidence/${fid}`)) } catch (e: any) { toast(e.message) } };
    const packet = async () => {
        setPacketBusy(true);
        try {
            const result = await api(`/api/cases/${c.id}/generate-packet`, { method: 'POST' });
            setDraft({ url: await fetchFile(result.downloadUrl), filename: result.filename });
        } catch (error: any) {
            toast(error.message);
        } finally {
            setPacketBusy(false);
        }
    };
    const markReady = async () => { try { await api(`/api/cases/${c.id}/ready`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ overrideReason: reason }) }); await refresh(); toast('Case marked ready. Staff override recorded if provided.') } catch (e: any) { toast(e.message) } };
    const simulate = async () => { try { const r = await api(`/api/cases/${c.id}/simulate-submission`, { method: 'POST' }); await refresh(); toast(`${r.status}. Reference ${r.reference}`) } catch (e: any) { toast(e.message) } };
    const remove = async (id: string) => { try { await api(`/api/cases/${c.id}/documents/${id}`, { method: 'DELETE' }); await refresh(); toast('Document removed') } catch (e: any) { toast(e.message) } };
    const groups = Array.from(new Set((c.fields || []).map((f: Field) => f.group_name)));
    return <><div className="heading"><div><div className="eyebrow">Case workspace <span className="synthetic">SYNTHETIC DEMO</span></div><h1>{c.patientName || 'New patient case'}</h1><p className="sub">{c.patientId || c.id.slice(0, 8)} &nbsp;·&nbsp; {c.hospitalName} &nbsp;·&nbsp; {c.admissionDate || 'Admission date not set'}</p></div></div><div className="notice">Review the case and its source documents before exporting a draft.</div>
        <nav className="workflow" aria-label="Case workflow">
            {([['Case workspace', 'Create Case'], ['Documents', 'Upload Documents'], ['Review & evidence', 'Review Evidence'], ['Evidence graph', 'Evidence Graph'], ['Generate Packet', 'Generate Packet']]).map(([route, label]) =>
                <button className={`btn small ${page === route ? 'primary' : ''}`} key={route} aria-current={page === route ? 'step' : undefined} onClick={() => navigate(route)}>{label}</button>
            )}
        </nav>
        {guided && <section className="card guided-panel">
            <div><h2 className="paneltitle">Guided Demo · Aarav Sharma</h2>
                <p>{liveAnalysis ? 'Live analysis completed in this session. Prepared review decisions were retained.' : 'This fictional copy begins with prepared demo-rule extraction and review decisions. Use Analyze documents to run the configured provider live.'}</p>
                <p>Inspect the graph, follow the next action, and compare both admission-date sources. Review the values before exporting the packet.</p></div>
            <div className="guided-links">
                <Link href="/journey" className="btn small">Patient story</Link>
                <button className="btn small" onClick={() => navigate('Evidence graph')}>Inspect graph</button>
                <button className="btn small" onClick={() => navigate('Documents', 'process-documents')}>Analyze documents</button>
                <Link href="/evaluation" className="btn small">Measured results</Link>
                <Link href={`/trust?case=${c.id}`} className="btn small">Case activity</Link>
            </div>
        </section>}
        {page !== 'Evidence graph' && <AgentActivity caseId={c.id} refresh={refresh} navigate={navigate} openEvidence={showEvidence} />}
        {c.readiness && page !== 'Evidence graph' && <ReadinessPanel data={c.readiness} navigate={navigate} />}
        {page === 'Evidence graph' && <EvidenceGraph data={c} target={target?.id} openEvidence={showEvidence} navigate={navigate}
            downloadSource={id => {
                const doc = c.documents.find((item: Doc) => item.id === id);
                if (doc) downloadFile(`/api/cases/${c.id}/documents/${id}/file`, doc.filename).catch(error => toast(error.message));
            }} />}
        {page === 'Case workspace' && <><div className="grid2"><div className="card"><h2 className="paneltitle" style={{ marginBottom: 15 }}>Case details</h2><div className="formgrid">{[['Patient ID', c.patientId], ['Age / gender', [c.age, c.gender].filter(Boolean).join(' / ')], ['Admission reason', c.reason], ['Provisional diagnosis', c.diagnosis], ['Planned treatment', c.treatment], ['Insurance / policy', [c.insurer, c.policyNumber].filter(Boolean).join(' · ')], ['TPA', c.tpa], ['Estimated cost', c.estimatedCost ? `₹${Number(c.estimatedCost).toLocaleString('en-IN')}` : '']].map(([k, v]: any) => <div key={k}><div className="muted">{k}</div><div style={{ marginTop: 5, fontWeight: 600 }}>{inp(k, v)}</div></div>)}</div></div><div className="card"><h2 className="paneltitle">Readiness</h2><div style={{ marginTop: 15 }}>Current status: {badge(c.status)}</div><div className="hr" /><div className="checkrow"><span>Extracted fields</span><b>{c.reviewSummary?.total || 0}</b></div><div className="checkrow"><span>Unreviewed</span><b>{c.reviewSummary?.Unreviewed || 0}</b></div><div className="checkrow"><span>Conflicts</span><b>{c.conflicts?.length || 0}</b></div><div style={{ display: 'flex', gap: 8, marginTop: 17, flexWrap: 'wrap' }}><button className="btn small" onClick={() => setPage('Review & evidence')}>Review fields <ArrowRight size={13} /></button><button className="btn small" onClick={() => setPage('Generate Packet')}><Download size={13} />Generate packet</button></div></div></div><div className="card" style={{ marginTop: 17, padding: 0 }}><div className="sectionhead"><h2 className="paneltitle">Documents</h2><button className="btn small" onClick={() => setPage('Documents')}>Manage documents <ArrowRight size={13} /></button></div>{(c.documents || []).map((d: Doc) => <DocumentRow d={d} key={d.id} remove={() => remove(d.id)} />)}{!c.documents?.length && <div className="empty">No documents uploaded yet.</div>}</div></>}
        {page === 'Documents' && <div className="twocol"><div className="card" id="upload-documents" tabIndex={-1}><h2 className="paneltitle">Upload supporting documents</h2>{guided && missingCard && <button className="btn small" onClick={uploadMembership} disabled={uploading || processing}>Upload fictional membership card</button>}<p className="sub" style={{ marginTop: 7, marginBottom: 18 }}>PDF, PNG or JPEG · up to 8 files per upload, 15 MB each. PDF text is extracted locally; images use local Tesseract if installed.</p><div className="uploadzone"><Upload size={24} style={{ color: '#378780' }} /><div className="upload-options"><label>Choose documents<input type="file" accept=".pdf,.png,.jpg,.jpeg" multiple disabled={uploading || processing} onChange={e => selectFiles(e.currentTarget)} /></label><label>Take a photo<input type="file" accept="image/*" capture="environment" disabled={uploading || processing} onChange={e => selectFiles(e.currentTarget)} /></label></div></div>{files.map((f, i) => <div className="docrow" key={`${f.name}-${i}`}>{f.type.startsWith('image/') && <FilePreview file={f} />}<span className="docname" style={{ flex: 1 }}>{f.name}</span><select className="fieldinput" value={categoriesByFile[i] || 'Other supporting documents'} onChange={e => setCategoriesByFile({ ...categoriesByFile, [i]: e.target.value })}>{categories.map(x => <option key={x}>{x}</option>)}</select><button className="close" title="Remove or retake" disabled={uploading} onClick={() => discardFile(i)}><X size={15} /></button></div>)}<div className="actions"><button className="btn primary" onClick={upload} disabled={!files.length || uploading || processing}><Upload size={15} />{uploading ? 'Uploading…' : `Upload ${files.length || ''}`}</button></div></div><div className="card"><h2 className="paneltitle">Processing</h2><p className="sub" style={{ margin: '8px 0 16px' }}>Text extraction and structured field detection runs locally on this laptop. No external AI service receives documents.</p><div className="provider"><Wifi size={14} />{provider === 'ollama' ? 'Ollama local model' : 'Deterministic demo rules'} active</div><div className="notice">Demo rules only extract explicit patterns they recognize. Unsupported fields stay absent. Ollama mode is configurable with AI_PROVIDER=ollama.</div><button className="btn primary" style={{ width: '100%', justifyContent: 'center' }} id="process-documents" disabled={processing || uploading || !c.documents?.length} onClick={process}>{processing ? <><span className="spinner" />Processing documents…</> : <><RefreshCw size={15} />Process documents</>}</button><div className="muted" style={{ marginTop: 9 }}>Uploaded documents: {c.documents?.length || 0}</div></div><div className="card" style={{ gridColumn: '1/-1', padding: 0 }}><div className="sectionhead"><h2 className="paneltitle">Uploaded documents</h2><span className="muted">{c.documents?.length || 0} files</span></div>{(c.documents || []).map((d: Doc) => <DocumentRow d={d} key={d.id} remove={() => remove(d.id)} />)}{!c.documents?.length && <div className="empty">No files yet. Add admission notes, clinical notes and reports.</div>}</div></div>}
        {page === 'Review & evidence' && <div className="twocol"><div className="card" id="review-fields" tabIndex={-1}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}><h2 className="paneltitle">Extracted information</h2><button className="btn small" onClick={process} disabled={processing || !c.documents?.length}><RefreshCw size={13} />Reprocess</button></div><p className="sub" style={{ margin: '7px 0 10px' }}>Select a source snippet to inspect the document evidence. Review each value before preparing a packet.</p>{groups.map((g: any) => <div key={g}><div className="grouphead">{g}</div>{c.fields.filter((f: Field) => f.group_name === g).map((f: Field) => <div className="fieldrow" key={f.id} id={`field-${f.id}`} tabIndex={-1}><div className="fieldname">{f.name}</div><div>{editId === f.id ? <input className="fieldinput" value={editVal} onChange={e => setEditVal(e.target.value)} /> : <div className="fieldvalue">{f.value}</div>}<button className="evidence" disabled={!f.source_doc} onClick={() => showEvidence(f.id)}><FileText size={11} style={{ verticalAlign: 'middle' }} /> {f.source_name || 'Manual entry'}{f.page ? ` · page ${f.page}` : ''}</button></div><div className="field-review">{badge(f.review)}<div className="muted">{f.origin !== 'AI-extracted' ? f.origin : f.provider === 'mock' ? 'Demo rules' : f.provider === 'ollama' ? 'Local Ollama' : f.origin} · {f.evidenceStatus}</div></div><div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>{editId === f.id ? <><button className="btn small" disabled={reviewBusy || processing} onClick={() => review(f, 'Edited')}><Check size={12} />Save</button><button className="btn small" onClick={() => setEditId('')}>Cancel</button></> : <><button className="btn small" title="Edit" onClick={() => { setEditId(f.id); setEditVal(f.value) }}>Edit</button><button className="btn small" aria-label="Verify field" title="Verify" disabled={reviewBusy || processing} onClick={() => review(f, 'Verified')}><Check size={13} /></button><button className="btn small" aria-label="Reject field" title="Reject" disabled={reviewBusy || processing} onClick={() => review(f, 'Rejected')}><X size={13} /></button><button className="btn small" disabled={reviewBusy || processing} onClick={() => review(f, 'Unable to Verify')}>Unable to verify</button></>}</div></div>)}</div>)}{!c.fields?.length && <div className="empty">No extracted fields. Upload records and run processing.</div>}</div><div><div className="card"><h2 className="paneltitle">Review summary</h2>{[['Total fields', c.reviewSummary?.total || 0], ['Verified', c.reviewSummary?.Verified || 0], ['Edited', c.reviewSummary?.Edited || 0], ['Rejected', c.reviewSummary?.Rejected || 0], ['Unreviewed', c.reviewSummary?.Unreviewed || 0], ['Unable to verify', c.reviewSummary?.['Unable to Verify'] || 0], ['Unresolved conflicts', c.reviewSummary?.unresolvedConflicts || 0]].map(([k, v]: any) => <div className="checkrow" key={k}><span>{k}</span><b>{v}</b></div>)}</div><div className="card" style={{ marginTop: 14 }}><h2 className="paneltitle">Policy document checklist</h2><p className="muted" style={{ lineHeight: 1.5 }}>Fictional demo requirements; presence does not determine eligibility.</p>{(c.checklist || []).map((x: any) => <div className="checkrow" key={x.requirement}><span>{x.requirement}</span>{badge(x.status)}</div>)}</div><div className="card" style={{ marginTop: 14 }} id="review-conflicts" tabIndex={-1}><h2 className="paneltitle">Potential conflicts</h2>{c.conflicts?.length ? c.conflicts.map((x: any) => <div className="conflict" key={x.field}><b>{x.field} needs resolution</b><p>Verify the supported value or reject unsupported alternatives. Different verified values keep the conflict open.</p>{x.values.map((v: any) => <div key={v.fieldId}>{v.value} · {v.source || 'Manual entry'}{v.page ? ` · page ${v.page}` : ''}</div>)}</div>) : <p className="muted" style={{ marginTop: 12 }}>No conflicting values detected.</p>}</div><div className="card" style={{ marginTop: 14 }}><h2 className="paneltitle">Next steps</h2><div className="notice">Review fields, resolve conflicts and address missing checklist items. Record a staff override if issues remain.</div><textarea className="fieldinput" rows={3} style={{ width: '100%' }} placeholder="Override reason (required if warnings remain)" value={reason} onChange={e => setReason(e.target.value)} /><button className="btn primary" style={{ width: '100%', justifyContent: 'center', marginTop: 9 }} onClick={markReady}><ShieldCheck size={15} />Mark ready for submission</button><button className="btn" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }} onClick={() => setPage('Generate Packet')}><ArrowRight size={15} />Continue to Generate Packet</button>{c.status === 'Ready for Submission' && <button className="btn" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }} onClick={simulate}><CheckCircle2 size={15} />Simulate submission</button>}{c.submission && <div className="notice">{c.submission.status}<br />Simulation reference {c.submission.reference}</div>}</div></div></div>}
        {page === 'Review & evidence' && c.readiness && <details className="card staff-field" id="staff-field" tabIndex={-1}>
            <summary>Record a staff-verified value</summary>
            <p className="muted">Use a value you have checked. The packet will identify it as a staff entry without a linked source.</p>
            <form className="formgrid" onSubmit={event => { event.preventDefault(); recordStaffValue(); }}>
                <label>Essential field<select className="fieldinput" required value={manualName} onChange={event => setManualName(event.target.value)}>
                    <option value="">Select a field</option>
                    {c.readiness.essentialFields.map((name: string) => <option key={name}>{name}</option>)}
                </select></label>
                <label>Verified value<input className="fieldinput" required maxLength={4000} value={manualValue} onChange={event => setManualValue(event.target.value)} /></label>
                <label><input type="checkbox" checked={manualConfirmed} onChange={event => setManualConfirmed(event.target.checked)} /> I checked this value.</label>
                <button className="btn primary" disabled={!manualConfirmed || reviewBusy || processing}>Record staff value</button>
            </form>
        </details>}
        {page === 'Generate Packet' && <div className="card">
            <h2 className="paneltitle">Generate Packet</h2>
            <p className="sub">Export a PDF draft with the case details, evidence, review decisions and checklist.</p>
            <p>Case status {badge(c.status)}</p>
            <div className="actions packet-actions">
                <button className="btn" onClick={() => setPage('Review & evidence')}>Back to Review Evidence</button>
                <button className="btn primary" onClick={packet} disabled={packetBusy || reviewBusy || processing || c.status === 'Processing'}><Download size={15} />{packetBusy ? 'Preparing PDF…' : 'Generate PDF draft'}</button>
                {draft && <><a className="btn primary" href={draft.url} download={draft.filename}>Download PDF</a><a className="btn" href={draft.url} target="_blank" rel="noopener">Open PDF</a></>}
            </div>
        </div>}
        {evidence && <div className="modalback" onClick={() => setEvidence(null)}><div className="modal" onClick={e => e.stopPropagation()}><div className="modalhead"><div><div className="eyebrow">Evidence source · page {evidence.page || '—'}</div><h2 className="paneltitle">{evidence.field.name}: {evidence.field.value}</h2></div><button className="close" onClick={() => setEvidence(null)}><X size={20} /></button></div><div className="card" style={{ background: '#f7fafb' }}><div className="muted">{evidence.filename}</div>{evidence.field.origin === 'Edited by staff' && <p>Originally extracted {evidence.field.original}</p>}<blockquote style={{ margin: '12px 0 0', padding: '12px 15px', background: '#e9f5f3', borderLeft: '3px solid #16857e', color: '#275c58', lineHeight: 1.6 }}>{evidence.evidence || 'No source excerpt was recorded.'}</blockquote></div><h3 style={{ font: '700 13px Manrope', marginTop: 18 }}>Extracted text from source document</h3><pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: '#f7f9fa', padding: 14, borderRadius: 7, font: '12px/1.65 monospace', maxHeight: 250, overflow: 'auto' }}>{evidence.sourceText || 'No extractable text. Image OCR may not be installed.'}</pre><div className="muted">Evidence snippet is displayed as text; no precise page highlighting is claimed.</div><div className="actions"><button className="btn" onClick={() => downloadFile(evidence.downloadUrl, evidence.filename).catch(error => toast(error.message))}><FileText size={14} />Download source file</button><button className="btn" onClick={() => setEvidence(null)}>Close</button></div></div></div>}
    </>
}
function DocumentRow({ d, remove }: any) { return <div className="docrow" id={`document-${d.id}`} tabIndex={-1} style={{ padding: '13px 20px' }}><div className="docleft"><div className="docicon"><FileText size={16} /></div><div><div className="docname">{d.filename}</div><div className="muted">{d.category} · {d.pages || '—'} page(s) · {d.status}</div></div></div><button className="close" title="Remove document" onClick={remove}><Trash2 size={15} /></button></div> }
function FilePreview({ file }: { file: File }) { const [url, setUrl] = useState(''); useEffect(() => { const value = URL.createObjectURL(file); setUrl(value); return () => URL.revokeObjectURL(value) }, [file]); return url ? <img src={url} alt={`Preview of ${file.name}`} style={{ width: 45, height: 45, objectFit: 'cover', borderRadius: 6, border: '1px solid #dce4e9' }} /> : null }
