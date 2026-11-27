'use client';

import { useEffect, useState } from 'react';
import { api } from '../client-api';

type Classification = { precision: number | null; recall: number | null; f1: number | null; tp: number; fp: number; fn: number };
type Run = {
    provider: 'mock' | 'ollama'; model: string | null; timestamp: string; casesEvaluated: number; fixtureSubset?: string[];
    hardware: { cpu: string; logicalCores: number; gpu: string | null; platform: string; ollamaVramBytes?: number };
    fields: Classification; conflicts: Classification; missingDocuments: Classification;
    evidenceCorrectness: number | null; evidenceCorrect: number; citations: number; unsupportedRate: number | null;
    rejectedSlots: number; ocrFailedPages: number; unreadablePages: number; processingFailures: number;
    meanCaseLatencyMs: number | null; meanModelCallMs: number | null; modelCalls: number;
    cases: { id: string; scenario: string; status: string; elapsedMs: number; missedFields: string[]; detectedMissing: string[]; detectedConflicts: string[]; missedConflicts: string[]; missedDocuments: string[]; ocrFailedPages: number; unreadablePages: number; rejectedSlots: number }[];
};
type Timing = { protocol: string; manualSeconds: number[]; assistedSeconds: number[] };
const percentage = (value: number | null) => value === null ? '—' : `${(value * 100).toFixed(1)}%`;
const duration = (ms: number | null) => ms === null ? '—' : `${(ms / 1000).toFixed(2)} s`;
const average = (values: number[]) => (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1);

async function resultFile<T>(name: string): Promise<T | null> {
    const response = await fetch(`/evaluation/${name}.json`, { cache: 'no-store' });
    if (!response.ok) return null;
    return response.json();
}

function RunResults({ run }: { run: Run }) {
    return <article className="public-panel benchmark-run">
        <h2>{run.provider === 'mock' ? 'Deterministic demo rules' : `Local Ollama · ${run.model}`}</h2>
        <p>{run.casesEvaluated} cases{run.fixtureSubset && ` (selected fixtures: ${run.fixtureSubset.join(", ")})`} · <time dateTime={run.timestamp}>{new Date(run.timestamp).toLocaleString()}</time></p>
        <p>{run.hardware.cpu} · {run.hardware.logicalCores} logical CPUs · {run.hardware.platform} · {run.hardware.gpu || 'GPU configuration unavailable to script'}{run.hardware.ollamaVramBytes === 0 ? ' · Ollama reported 0 B VRAM' : ''}</p>
        <div className="benchmark-stats">
            <div><strong>{duration(run.meanCaseLatencyMs)}</strong><span>Mean case latency</span></div>
            <div><strong>{duration(run.meanModelCallMs)}</strong><span>Mean model request · {run.modelCalls} calls</span></div>
            <div><strong>{percentage(run.evidenceCorrectness)}</strong><span>Evidence citations · {run.evidenceCorrect}/{run.citations}</span></div>
            <div><strong>{percentage(run.unsupportedRate)}</strong><span>Unsupported extractions · {run.rejectedSlots} proposals excluded</span></div>
        </div>
        <div className="tablewrap"><table><thead><tr><th scope="col">Measure</th><th scope="col">Precision</th><th scope="col">Recall</th><th scope="col">F1</th><th scope="col">TP / FP / FN</th></tr></thead>
            <tbody>{([['Field extraction', run.fields], ['Missing-document detection', run.missingDocuments], ['Conflict detection', run.conflicts]] as const).map(([label, value]) =>
                <tr key={label}><th scope="row">{label}</th><td>{percentage(value.precision)}</td><td>{percentage(value.recall)}</td>
                    <td>{percentage(value.f1)}</td><td>{value.tp} / {value.fp} / {value.fn}</td></tr>)}</tbody></table></div>
        <p>{run.processingFailures} processing failures · {run.ocrFailedPages} OCR execution failures · {run.unreadablePages} unreadable pages</p>
        <details><summary>Case results and failures</summary><ul className="benchmark-cases">{run.cases.map(item => <li key={item.id}>
            <strong>{item.id} · {item.scenario}</strong><span>{item.status} · {duration(item.elapsedMs)}</span>
            {item.detectedMissing.length > 0 && <span>Missing documents detected · {item.detectedMissing.join(', ')}</span>}
            {item.detectedConflicts.length > 0 && <span>Conflicts detected · {item.detectedConflicts.join(', ')}</span>}
            {item.missedFields.length > 0 && <span>Missed values · {item.missedFields.join(', ')}</span>}
            {item.missedDocuments.length > 0 && <span>Missed document gaps · {item.missedDocuments.join(', ')}</span>}
            {item.missedConflicts.length > 0 && <span>Missed conflicts · {item.missedConflicts.join(', ')}</span>}
            {item.unreadablePages > 0 && <span>{item.unreadablePages} unreadable pages ({item.ocrFailedPages} OCR execution failures)</span>}
            {item.rejectedSlots > 0 && <span>{item.rejectedSlots} unsupported proposal slots excluded</span>}
        </li>)}</ul></details>
        <a href={`/evaluation/results-${run.provider}.json`} download>Download measured JSON</a>
    </article>;
}

export default function EvaluationResults() {
    const [runs, setRuns] = useState<{ mock?: Run | null; ollama?: Run | null }>({});
    const [active, setActive] = useState('Checking backend…');
    const [timing, setTiming] = useState<Timing | null>(null);
    useEffect(() => {
        let current = true;
        Promise.all([
            resultFile<Run>('results-mock').catch(() => null),
            resultFile<Run>('results-ollama').catch(() => null),
            resultFile<Timing>('workflow-timing').catch(() => null),
        ]).then(([mock, ollama, comparison]) => {
            if (!current) return;
            setRuns({ mock, ollama });
            if (comparison?.manualSeconds?.length && comparison?.assistedSeconds?.length
                && [...comparison.manualSeconds, ...comparison.assistedSeconds].every(value => Number.isFinite(value) && value > 0)) setTiming(comparison);
        });
        api('/api/health').then(health => {
            if (current) setActive(health.provider === 'ollama' ? `Ollama · ${health.ollamaModel}` : `Demo rules (${health.provider})`);
        }).catch(() => { if (current) setActive('Backend unavailable'); });
        return () => { current = false; };
    }, []);
    return <section className="public-section benchmark-results">
        <p><strong>Active workspace provider</strong> · {active}</p>
        <p>These measurements describe the synthetic fixture set. One system run per provider is shown.</p>
        {runs.mock ? <RunResults run={runs.mock} /> : <div className="public-panel"><h2>Deterministic demo rules</h2><p>{runs.mock === undefined ? 'Loading results…' : 'Not evaluated.'}</p></div>}
        {runs.ollama ? <RunResults run={runs.ollama} /> : <div className="public-panel"><h2>Real Ollama inference</h2><p>{runs.ollama === undefined ? 'Loading results…' : 'Not evaluated.'}</p></div>}
        <div className="public-panel"><h2>Manual versus assisted time</h2>
            {timing ? <><p>{timing.protocol}</p><p>Manual mean {average(timing.manualSeconds)} s ({timing.manualSeconds.length} timings) · Assisted mean {average(timing.assistedSeconds)} s ({timing.assistedSeconds.length} timings)</p></> :
                <p>No manually recorded workflow timing has been published.</p>}
        </div>
    </section>;
}
