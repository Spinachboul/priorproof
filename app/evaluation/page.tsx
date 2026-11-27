import { PublicShell } from '../public-shell';
import EvaluationResults from './results';

export default function EvaluationPage() {
    return <PublicShell>
        <section className="public-section page-intro">
            <p className="public-overline">Synthetic benchmark</p><h1>How PriorProof was evaluated</h1>
            <p>Ten authored cases cover complete and incomplete files, conflicting values, scans, absent facts and embedded instructions.</p>
            <div className="public-actions"><a className="public-button primary" href="/evaluation/synthetic-cases.zip" download>Download fictional PDFs and ground truth</a></div>
        </section>
        <EvaluationResults />
    </PublicShell>;
}
