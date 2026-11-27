import Image from 'next/image';
import Link from 'next/link';
import { ArrowDown, ArrowRight, ClipboardCheck, FileStack, Link2, ScanText, ShieldCheck } from 'lucide-react';
import { PublicShell } from './public-shell';

const steps = [
    { title: 'Create a case', detail: 'Record the admission and insurance details that staff already have.', icon: ClipboardCheck },
    { title: 'Upload documents', detail: 'Collect admission notes, reports and insurance records in one place.', icon: FileStack },
    { title: 'Review evidence', detail: 'Check each proposed value against its source and resolve contradictions.', icon: Link2 },
    { title: 'Generate a packet', detail: 'Export a draft with citations, missing items and recorded review decisions.', icon: ScanText },
];

export default function Landing() {
    return <PublicShell>
        <section className="public-hero">
            <div className="hero-copy">
                <p className="public-overline">Cashless pre-authorization for hospital teams</p>
                <h1>Healthcare shouldn&apos;t have to wait for paperwork.</h1>
                <p className="hero-intro">PriorProof helps hospital teams turn scattered medical records into evidence-backed cashless insurance requests, so administrative work does not create unnecessary obstacles in a patient&apos;s treatment journey.</p>
                <div className="public-actions">
                    <Link className="public-button primary" href="/workspace?case=new">Prepare a Cashless Request <ArrowRight size={17} /></Link>
                    <Link className="public-button outline" href="/journey">Explore Patient Journey</Link>
                </div>
                <a className="hero-jump" href="#workflow"><ArrowDown size={16} /> How PriorProof works</a>
            </div>
            <figure className="hero-visual">
                <Image src="/admissions-illustration.png" alt="Illustrative scene of a patient and an admissions coordinator reviewing paperwork together" fill priority sizes="(max-width: 850px) 94vw, 42vw" unoptimized />
                <figcaption><ShieldCheck size={15} /> Local processing · Staff verification</figcaption>
            </figure>
        </section>
        <section className="public-section public-problem" id="workflow">
            <div><p className="public-overline">From records to a reliable draft</p><h2>A patient should be waiting for treatment, not paperwork.</h2></div>
            <p>Preparing a request can mean searching across forms, reports and scans. Missing identification and conflicting dates can send staff back to the source. PriorProof brings those questions into one review.</p>
        </section>
        <section className="public-section">
            <h2>Four steps from admission to draft</h2>
            <div className="public-steps">{steps.map(({ title, detail, icon: Icon }) => <article key={title}><Icon size={23} aria-hidden /><h3>{title}</h3><p>{detail}</p></article>)}</div>
        </section>
        <section className="public-section public-explanation">
            <div><p className="public-overline">Evidence traceability</p><h2>See where each value came from.</h2><p>Open the original document, page and quoted passage behind an extracted value. Local analysis proposes fields and flags gaps. Hospital staff verify the evidence and decide what belongs in the draft.</p></div>
            <div><h3>What PriorProof does</h3><p>Prepares a draft cashless request for staff review. Diagnosis, coverage decisions and claim approval remain outside the application.</p><Link className="public-button outline" href="/journey#guided-demo">Guided Demo <ArrowRight size={16} /></Link></div>
        </section>
    </PublicShell>;
}
