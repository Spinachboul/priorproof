import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { PublicShell } from '../public-shell';
import JourneyTimeline from './journey';

export default function PatientJourney() {
    return <PublicShell>
        <div className="public-section page-intro">
            <p className="public-overline">Fictional patient · Synthetic records</p>
            <h1>Aarav Sharma&apos;s patient journey</h1>
            <p>Follow the hospital desk team as it prepares a cashless pre-authorization request from the records available.</p>
        </div>
        <JourneyTimeline />
        <section className="public-section public-explanation" id="guided-demo">
            <div><p className="public-overline">Guided Demo</p><h2>Take the case from evidence to packet.</h2><p>Sign in to a prepared copy of Aarav’s fictional case. Upload the sample membership card, run local analysis, inspect the evidence graph, resolve the admission date, and export the draft. The workspace identifies prepared review decisions and any live processing you run.</p></div>
            <div className="public-actions"><Link className="public-button primary" href="/workspace?case=guided">Start Guided Demo <ArrowRight size={16} /></Link><Link className="public-button outline" href="/workspace?case=aarav">Open original synthetic case</Link></div>
        </section>
    </PublicShell>;
}
