import type { Metadata } from 'next';
import Link from 'next/link';
import { PublicShell } from '../public-shell';
import { integrityCapabilities, productCapabilities, productStages } from '../public-content';
import { WorkflowExplorer } from '../workflow-explorer';
import benchmark from '../../public/evaluation/results-ollama.json';

export const metadata: Metadata = { title: 'Product | PriorProof', description: 'From documents to an evidence-linked, staff-reviewed pre-authorization draft.' };

const repository = 'https://github.com/Spinachboul/priorproof';
const percent = (value: number | null) => value === null ? 'Unavailable' : `${(value * 100).toFixed(1)}%`;
const seconds = (ms: number | null) => ms === null ? 'Unavailable' : `${(ms / 1000).toFixed(1)} s`;
const found = ({ tp, fn }: { tp: number; fn: number }) => `${tp}/${tp + fn}`;

const benchmarkMetrics = [
    [String(benchmark.casesEvaluated), 'Synthetic cases'],
    [percent(benchmark.fields.f1), 'Field extraction F1'],
    [percent(benchmark.fields.recall), 'Field recall'],
    [`${benchmark.evidenceCorrect}/${benchmark.citations}`, 'Correct accepted evidence citations'],
    [found(benchmark.missingDocuments), 'Missing document items detected'],
    [found(benchmark.conflicts), 'Conflicts detected'],
    [seconds(benchmark.meanCaseLatencyMs), 'Mean processing time per case'],
];

const demoSteps = [
    { title: 'Open the public website', body: <>Start at <Link href="/">PriorProof home</Link>, then follow <Link href="/journey">Aarav’s fictional patient journey</Link> to see the background.</> },
    { title: 'Start the preparation agent', body: <>Open <Link href="/workspace?case=guided">Start Guided Demo</Link>. When both demo flags are enabled, the workspace signs in to the fictional account. Choose <strong>Start preparation</strong> in <strong>Agent Activity</strong>. The agent pauses for insurance identification.</> },
    { title: 'Connect Expo and upload the missing card', body: <>Sign in as the demo user in Expo. Select <strong>Show case QR</strong> on the website and <strong>Scan case QR</strong> in Expo. In <strong>Agent tasks</strong>, select <strong>Insurance identification</strong> and upload the <a href="/evaluation/aarav-membership.pdf" download>fictional membership PDF</a> with that category. Select <strong>Confirm update and resume</strong>.</> },
    { title: 'Resolve the admission-date conflict', body: <>Open both sources. Verify the admission note’s <strong>26 November 2026</strong> value and reject the treatment plan’s <strong>27 November 2026</strong> value. Confirm the change and resume the agent.</> },
    { title: 'Review the evidence-backed draft', body: <>Use <strong>Approve draft preparation</strong> after the readiness checks pass. Inspect the evidence and review the draft in the workspace or in Expo. You can also download the draft PDF.</> },
];

const terminal = {
    lan: 'LAN_IP=$(ip -4 route get 1.1.1.1 | awk \'{for(i=1;i<=NF;i++) if($i=="src") {print $(i+1);exit}}\')\nprintf "%s\\n" "$LAN_IP"',
    api: 'cd backend\nDATABASE_PATH=./data/phase3-demo.db UPLOAD_DIR=./data/phase3-uploads \\\n  AI_PROVIDER=mock AGENT_PLANNER=disabled DEMO_LOGIN_ENABLED=1 \\\n  CORS_ORIGINS="http://$LAN_IP:3000" \\\n  .venv/bin/python -m uvicorn app.main:app --host "$LAN_IP" --port 8000',
    web: 'NEXT_PUBLIC_API_URL="http://$LAN_IP:8000" NEXT_TELEMETRY_DISABLED=1 npm run build:demo\nNEXT_TELEMETRY_DISABLED=1 ./node_modules/.bin/next start --hostname "$LAN_IP" --port 3000',
    expo: 'cd mobile\nEXPO_PUBLIC_API_URL="http://$LAN_IP:8000" npx expo start --go --lan',
};

export default function ProductPage() {
    return <PublicShell active="/product">
        <section className="public-section marketing-intro">
            <p className="marketing-kicker">Product</p>
            <h1>Follow a claim from preparation to financial review.</h1>
            <p>PriorProof helps a hospital desk assemble a draft from medical and insurance records, resolve gaps and contradictions, and review what the draft says before export.</p>
            <div className="public-actions"><Link href="#try" className="public-button primary">Try PriorProof</Link><Link href="/workspace?case=new" className="public-button outline">Prepare a Cashless Request</Link></div>
        </section>
        <section className="public-section marketing-section">
            <h2>From medical documents to a reviewed draft</h2>
            <p>Select a stage or play the walkthrough.</p>
            <WorkflowExplorer label="PriorProof product workflow" stages={productStages} play />
        </section>
        <section className="public-section marketing-section">
            <h2>What the prototype supports</h2>
            <div className="marketing-grid three">{productCapabilities.map(item => <article className="public-panel marketing-card" key={item.title}>
                <p className="stat-period">{item.scope}</p><h3>{item.title}</h3><p>{item.detail}</p>
            </article>)}</div>
            <p>Local inference keeps model calls on the configured local service. Reviewers can see why a document was collected, inspect masked text and open originals through authorized case access. The current mask applies to preview text. The prototype is for synthetic records, with production gaps documented in the Trust Centre.</p>
            <div className="public-actions"><Link href="/trust#patient-privacy" className="public-button outline">Patient privacy controls</Link><Link href="/trust#regulatory-readiness" className="public-button outline">DPDP regulatory readiness</Link></div>
        </section>
        <section className="public-section marketing-section">
            <h2>Claim integrity beyond preparation</h2>
            <div className="marketing-grid two">{integrityCapabilities.map(item => <article className="public-panel marketing-card" key={item.title}>
                <p className="stat-period">{item.scope}</p><h3>{item.title}</h3><p>{item.detail}</p>
            </article>)}</div>
        </section>
        <section className="public-section marketing-section">
            <h2>Measured on synthetic records</h2>
            <p>Published local Ollama run · <code>{benchmark.model}</code></p>
            <dl className="benchmark-highlight">{benchmarkMetrics.map(([value, label]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
            <p className="marketing-note">The dashboard shows the {benchmark.conflicts.fn} missed fixture {benchmark.conflicts.fn === 1 ? 'conflict' : 'conflicts'}. Accepted citation correctness covers the citations produced and accepted in this run. The evaluation dashboard reports a separate deterministic mock run. Clinical accuracy, hospital savings and production reliability require separate evaluation.</p>
            <div className="public-actions"><Link href="/evaluation" className="public-button primary">View evaluation and case-level failures</Link><a className="public-button outline" href="/evaluation/results-ollama.json">Open measured JSON</a></div>
        </section>
        <section className="public-section marketing-section" id="try">
            <h2>Try PriorProof</h2>
            <p><Link href="/workspace?case=financial">Aarav’s Complete Financial Journey</Link> follows a separate fictional case through revised authorization, billing and an insurer payment investigation. Open it with synthetic demo mode enabled.</p>
            <p>Follow the fictional Aarav case on the web and use Expo to add the missing evidence.</p>
            <ol className="demo-walkthrough">{demoSteps.map(step => <li key={step.title}><h3>{step.title}</h3><p>{step.body}</p></li>)}</ol>
            <div className="public-actions"><Link href="/workspace?case=guided" className="public-button primary">Start Guided Demo</Link><Link href="/journey" className="public-button outline">Open the patient journey</Link></div>
        </section>
        <section className="public-section marketing-section" id="developer-setup">
            <h2>Developer setup for web and Expo</h2>
            <p>Follow the one-time installation in the README. Open three terminals at the repository root on your laptop. Run the LAN lookup in each terminal and confirm it selects the laptop’s Wi-Fi address. If it selects a VPN or another interface, use <code>ip -4 -br addr</code> to find the Wi-Fi address and set <code>LAN_IP</code> to that value in each terminal.</p>
            <div className="developer-commands">
                <h3>Get the LAN address</h3><pre tabIndex={0}><code>{terminal.lan}</code></pre>
                <h3>Terminal 1 · Start the API</h3><pre tabIndex={0}><code>{terminal.api}</code></pre>
                <p>On the phone’s browser, open <code>http://&lt;LAN_IP&gt;:8000/api/health</code> with the resolved address and check for a JSON response. If it fails, check the API bind address, laptop firewall and Wi-Fi client isolation before starting Expo.</p>
                <h3>Terminal 2 · Build and serve the demo website</h3><pre tabIndex={0}><code>{terminal.web}</code></pre>
                <p>Open <code>http://&lt;LAN_IP&gt;:3000</code> on the laptop. Open the same address on the phone to download the fictional membership PDF.</p>
                <h3>Terminal 3 · Start Expo</h3><pre tabIndex={0}><code>{terminal.expo}</code></pre>
                <p>Open the development QR with Expo Go. The case-specific QR appears later inside the workspace. Use trusted Wi-Fi and fictional records with this local HTTP setup.</p>
            </div>
            <div className="public-actions"><a className="public-button outline" href={repository}>GitHub repository</a><a className="public-button outline" href={`${repository}#one-time-setup`}>Read the setup instructions</a></div>
        </section>
    </PublicShell>;
}
