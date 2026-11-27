import { PublicShell } from '../public-shell';
import TrustControls from './trust-controls';

export default function TrustPage() {
    return <PublicShell>
        <section className="public-section page-intro">
            <p className="public-overline">Privacy and staff accountability</p>
            <h1>Trust Centre</h1>
            <p>Use only fictional records in this demo. Sign in to inspect the running backend’s controls, view case activity, or remove a case.</p>
        </section>
        <TrustControls />
    </PublicShell>;
}
