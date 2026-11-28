import { PublicShell } from '../public-shell';
import EvaluationResults from './results';
import integrity from '../../public/evaluation/results-integrity.json';

export default function EvaluationPage() {
    return <PublicShell active="/evaluation">
        <section className="public-section page-intro">
            <p className="public-overline">Synthetic benchmark</p><h1>How PriorProof was evaluated</h1>
            <p>Ten authored cases cover complete and incomplete files, conflicting values, scans, absent facts and embedded instructions.</p>
            <div className="public-actions"><a className="public-button primary" href="/evaluation/synthetic-cases.zip" download>Download fictional PDFs and ground truth</a></div>
        </section>
        <EvaluationResults />
        <section className="public-section marketing-section" id="claim-integrity-benchmark">
            <h2>Claim integrity · deterministic calculation benchmark</h2>
            <p>{integrity.exactScenarios}/{integrity.scenarios} fixture scenarios matched. {integrity.exactValues}/{integrity.valuesCompared} expected value checks matched, including unknowns. Mean calculation time was {integrity.meanCalculationMs} ms in this run.</p>
            <ul>{integrity.limitations.map(limit => <li key={limit}>{limit}</li>)}</ul>
            <a href="/evaluation/results-integrity.json" download>Download scenario results, classification counts and limitations</a>
        </section>
    </PublicShell>;
}
