'use client';

import { useEffect, useMemo, useState } from 'react';

export type Action = { title: string; why: string; subject: string; view: string; target: string };
export type Readiness = {
    score: number;
    canMarkReady: boolean;
    override: string | null;
    essentialFields: string[];
    missingEssentialFields: string[];
    blockers: Pick<Action, 'subject' | 'why'>[];
    recommendations: Action[];
    components: { key: string; label: string; weight: number; earned: number; numerator: number; denominator: number; definition: string }[];
};

export type GraphCase = {
    id: string;
    patientName: string;
    readiness: Readiness;
    documents: { id: string; filename: string; category: string; pages: number; status: string }[];
    fields: { id: string; name: string; value: string; page: number | null; evidence: string | null; source_doc: string | null; source_name: string | null; evidenceStatus: string; provider: string | null; review: string }[];
    checklist: { requirement: string; status: string; sourceIds: string[]; note: string }[];
    conflicts: { field: string; values: { fieldId: string; value: string }[] }[];
    unsupportedProposals: { id: string; name: string; source_doc: string; page: number; provider: string }[];
};

const nodeWidth = 210, nodeHeight = 48, rowStep = 62, columnStep = 258;
type Node = { id: string; column: number; label: string; kind: string; state: string; description: string; page?: number | null; excerpt?: string | null; fieldId?: string; documentId?: string };
type Edge = { from: string; to: string; kind: 'case' | 'supports' | 'category' | 'conflict' | 'missing' | 'cites' };
const edgeLabels = { case: 'Case record', supports: 'Supports fact', category: 'Matches requirement by category', conflict: 'Contains conflicting values', missing: 'Lacks supporting document', cites: 'Cited source' };

function relationships(data: GraphCase) {
    const nodes: Node[] = [{ id: 'case', column: 0, label: data.patientName || 'Case record', kind: 'Patient case', state: 'Recorded', description: 'The documents and requirements shown belong to this authenticated case.' }];
    const edges: Edge[] = [];
    const openConflicts = new Set(data.conflicts.flatMap(conflict => conflict.values.map(value => value.fieldId)));
    for (const doc of data.documents) {
        nodes.push({ id: `document-${doc.id}`, column: 1, label: doc.filename, kind: 'Source document', state: /OCR failed|without readable text|no readable text/i.test(doc.status) ? 'Unreadable' : 'Recorded', description: `${doc.category} · ${doc.pages} page(s) · ${doc.status}`, documentId: doc.id });
        edges.push({ from: 'case', to: `document-${doc.id}`, kind: 'case' });
    }
    for (const fact of data.fields) {
        const id = `field-${fact.id}`;
        const state = openConflicts.has(fact.id) ? 'Conflicting'
            : fact.evidenceStatus === 'Supported' ? (fact.review === 'Verified' ? 'Verified' : 'Supported · unreviewed')
            : fact.evidenceStatus;
        const description = `${fact.value} · ${fact.review}${fact.source_name ? ` · ${fact.source_name}` : ''}`;
        nodes.push({ id, column: 2, label: fact.name, kind: 'Extracted fact', state, description,
            page: fact.page, excerpt: fact.evidence, fieldId: fact.source_doc ? fact.id : undefined });
        if (fact.source_doc) edges.push({ from: `document-${fact.source_doc}`, to: id, kind: fact.evidenceStatus === 'Supported' ? 'supports' : 'cites' });
        else edges.push({ from: 'case', to: id, kind: 'case' });
    }
    for (const proposal of data.unsupportedProposals) {
        const id = `rejected-${proposal.id}`;
        const filename = data.documents.find(doc => doc.id === proposal.source_doc)?.filename || 'Source document';
        nodes.push({ id, column: 2, label: proposal.name, kind: 'Excluded model proposal', state: 'Unsupported',
            description: `${filename} · The quoted page did not substantiate this proposal. Inspect the original before recording a value.`,
            page: proposal.page, documentId: proposal.source_doc });
        edges.push({ from: `document-${proposal.source_doc}`, to: id, kind: 'cites' });
    }
    for (const requirement of data.checklist) {
        const id = `requirement-${requirement.requirement}`;
        nodes.push({ id, column: 3, label: requirement.requirement, kind: 'Policy requirement', state: requirement.status, description: requirement.note });
        for (const doc of requirement.sourceIds) edges.push({ from: `document-${doc}`, to: id, kind: 'category' });
        if (requirement.status === 'Missing') {
            const missing = `missing-${requirement.requirement}`;
            nodes.push({ id: missing, column: 4, label: requirement.requirement, kind: 'Missing information', state: 'Missing',
                description: `Upload a document categorized as ${requirement.requirement}.` });
            edges.push({ from: id, to: missing, kind: 'missing' });
        }
    }
    for (const name of data.readiness.missingEssentialFields) {
        const id = `missing-field-${name}`;
        nodes.push({ id, column: 4, label: name, kind: 'Missing essential field', state: 'Missing',
            description: 'Find a source document that states this field explicitly.' });
        edges.push({ from: 'case', to: id, kind: 'missing' });
    }
    for (const conflict of data.conflicts) {
        const id = `conflict-${conflict.field}`;
        nodes.push({ id, column: 4, label: conflict.field, kind: 'Conflicting information', state: 'Conflicting',
            description: `${conflict.values.map(value => value.value).join(' / ')}. Compare the sources and record which value the evidence supports.` });
        for (const fact of conflict.values) edges.push({ from: `field-${fact.fieldId}`, to: id, kind: 'conflict' });
    }
    return { nodes, edges };
}

export function EvidenceGraph({ data, target, openEvidence, downloadSource, navigate }: {
    data: GraphCase; target?: string; openEvidence: (id: string) => void;
    downloadSource: (id: string) => void; navigate: (view: string, target?: string) => void;
}) {
    const [selected, setSelected] = useState('case');
    const [focus, setFocus] = useState(false);
    const { nodes, edges } = useMemo(() => relationships(data), [data]);
    useEffect(() => { if (target) setSelected(target); }, [target]);
    const active = nodes.find(node => node.id === selected) || nodes[0];
    const connected = edges.filter(edge => edge.from === active.id || edge.to === active.id);
    const visible = focus ? nodes.filter(node => node.id === active.id || connected.some(edge => edge.from === node.id || edge.to === node.id)) : nodes;
    const counts = [0, 0, 0, 0, 0];
    const positioned = new Map(visible.map(node => {
        const point = { x: 18 + node.column * columnStep, y: 44 + counts[node.column]++ * rowStep };
        return [node.id, point];
    }));
    const height = 62 + Math.max(1, ...counts) * rowStep;
    return <section className="card evidence-graph">
        <div className="sectionhead graph-heading"><div><h2 className="paneltitle">Evidence graph</h2><p className="sub">Explore which records support each value and which checklist items still need a document.</p></div>
        <label><input type="checkbox" checked={focus} onChange={event => setFocus(event.target.checked)} /> Show selected relationships</label></div>
        <div className="graph-detail" aria-live="polite">
            <div><strong>{active.label}</strong><span className="graph-state" data-state={active.state}>{active.state}</span></div>
            <p>{active.description}{active.page ? ` · Page ${active.page}` : ''}</p>
            {active.excerpt && <blockquote>{active.excerpt}</blockquote>}
            {active.fieldId && <button className="btn small" onClick={() => openEvidence(active.fieldId!)}>Open source evidence</button>}
            {active.documentId && <button className="btn small" onClick={() => downloadSource(active.documentId!)}>Download original</button>}
            {active.state === 'Missing' && <button className="btn small" onClick={() => navigate('Documents', 'upload-documents')}>Upload supporting document</button>}
            {active.state === 'Conflicting' && <button className="btn small" onClick={() => navigate('Review & evidence', active.id.startsWith('field-') ? active.id : 'review-conflicts')}>Review conflict</button>}
            {connected.length > 0 && <div className="graph-relations" aria-label="Related nodes">{connected.map(edge => {
                const id = edge.from === active.id ? edge.to : edge.from;
                const related = nodes.find(node => node.id === id);
                return <button key={`${edge.from}-${edge.to}`} className="btn small" onClick={() => setSelected(id)}>{edgeLabels[edge.kind]} · {related?.label}</button>;
            })}</div>}
        </div>
        <div className="graph-scroll" tabIndex={0} aria-label="Scrollable evidence graph">
            <div className="graph-board" style={{ width: columnStep * 5, height }}>
                <svg aria-hidden="true" width={columnStep * 5} height={height}>
                    {edges.map(edge => {
                        const a = positioned.get(edge.from), b = positioned.get(edge.to);
                        if (!a || !b) return null;
                        const x1 = a.x + nodeWidth, x2 = b.x, y1 = a.y + nodeHeight / 2, y2 = b.y + nodeHeight / 2;
                        return <path key={`${edge.from}-${edge.to}`} className={`graph-edge edge-${edge.kind}${edge.from === active.id || edge.to === active.id ? ' edge-active' : ''}`}
                            d={`M ${x1} ${y1} C ${(x1 + x2) / 2} ${y1}, ${(x1 + x2) / 2} ${y2}, ${x2} ${y2}`} />;
                    })}
                </svg>
                {['Case', 'Documents', 'Facts', 'Requirements', 'Open issues'].map((label, i) =>
                    <span className="graph-column" style={{ left: 18 + i * columnStep }} key={label}>{label}</span>
                )}
                {visible.map(node => {
                    const point = positioned.get(node.id)!;
                    return <button key={node.id} id={node.id === 'case' ? undefined : node.id} type="button" className="graph-node"
                        style={{ left: point.x, top: point.y, width: nodeWidth, height: nodeHeight }} data-state={node.state} aria-pressed={node.id === active.id}
                        title={node.label} onClick={() => setSelected(node.id)}><span>{node.label}</span><small>{node.kind} · {node.state}</small></button>;
                })}
            </div>
        </div>
        <p className="graph-key">Solid lines link records and facts. Dashed lines show checklist matches or open issues.</p>
    </section>;
}

export function ReadinessPanel({ data, navigate }: { data: Readiness; navigate: (view: string, target?: string) => void }) {
    const best = data.recommendations[0];
    return <section className="readiness-layout">
        <div className="card readiness-card">
            <div className="readiness-top"><div><h2 className="paneltitle">Submission readiness</h2><div className="muted">Internal document-preparation indicator</div></div><strong>{data.score}<small>/100</small></strong></div>
            <progress value={data.score} max={100} aria-label="Document-preparation score" />
            <details open><summary>Score breakdown</summary>
                {data.components.map(part => <div className="readiness-row" key={part.key}>
                    <div><strong>{part.label}</strong><span className="muted">{part.definition}</span></div>
                    <div>{part.numerator}/{part.denominator}<small>{part.earned}/{part.weight} pts</small></div>
                </div>)}
            </details>
            <p className="muted">The score does not predict insurer approval.</p>
            {data.blockers.length > 0 && <details className="readiness-warning">
                <summary>{data.blockers.length} readiness {data.blockers.length === 1 ? 'blocker' : 'blockers'} remain</summary>
                <ul>{data.blockers.map((issue, index) => <li key={`${issue.subject}-${index}`}><strong>{issue.subject}</strong> · {issue.why}</li>)}</ul>
            </details>}
            {data.override && <p className="readiness-warning">{data.override}. The recorded blockers remain visible.</p>}
            {data.canMarkReady && !data.override && <p className="readiness-clear">No outstanding readiness blockers.</p>}
        </div>
        <div className="card next-action">
            <h2 className="paneltitle">Smart next action</h2>
            {best ? <><strong>{best.title}</strong><div>{best.subject}</div><p>{best.why}</p>
                <button className="btn primary" onClick={() => navigate(best.view, best.target)}>Go to {best.view}</button>
                {data.recommendations.length > 1 && <details><summary>Other actions ({data.recommendations.length - 1})</summary>
                    <ul>{data.recommendations.slice(1).map((action, i) => <li key={`${action.target}-${i}`}>
                        <strong>{action.title} · {action.subject}</strong><p>{action.why}</p>
                        <button className="btn small" onClick={() => navigate(action.view, action.target)}>Go to {action.view}</button>
                    </li>)}</ul>
                </details>}
            </> : <p>All current checklist and review actions are complete.</p>}
        </div>
    </section>;
}
