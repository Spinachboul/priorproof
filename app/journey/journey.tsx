'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight } from 'lucide-react';

const events = [
    ['Hospital admission', 'Aarav arrives at the fictional Green Valley hospital with abdominal pain. The admissions team starts documenting the visit.'],
    ['Recommended treatment', 'The fictional treatment plan records a recommended procedure. The treating team remains responsible for care decisions.'],
    ['Prepare insurance documents', 'The desk team collects the admission note, clinical assessment, diagnostic report, treatment plan and cost estimate.'],
    ['Find missing documentation', 'The fictional policy explains what to collect. The team still needs Aarav’s insurance identification document.'],
    ['Inspect conflicting information', 'The admission note and treatment plan show dates one day apart. The desk team needs to determine which date belongs in the request.'],
    ['Analyze the records', 'PriorProof proposes fields with page references, links records in the evidence graph, and identifies the next action.'],
    ['Verify the evidence', 'A staff member compares the dates with the source records and records a review decision. The team adds the missing membership record.'],
    ['Prepare a draft packet', 'The team exports a draft with source citations, the checklist and the recorded review decisions. Insurer decisions and care remain outside the demo.'],
];

export default function JourneyTimeline() {
    const [step, selectStep] = useState(0);
    return <section className="public-section story-layout" aria-label="Aarav’s fictional patient journey">
        <ol className="story-index">
            {events.map(([title], index) => <li key={title}><button aria-current={index === step ? 'step' : undefined} onClick={() => selectStep(index)}>{title}</button></li>)}
        </ol>
        <article className="story-card" aria-live="polite">
            <p className="public-overline">Step {step + 1} of {events.length}</p>
            <h2>{events[step][0]}</h2><p>{events[step][1]}</p>
            <div className="public-actions">
                {step > 0 && <button className="public-button outline" onClick={() => selectStep(step - 1)}><ArrowLeft size={16} /> Previous</button>}
                {step + 1 < events.length ? <button className="public-button primary" onClick={() => selectStep(step + 1)}>Next <ArrowRight size={16} /></button> :
                    <Link className="public-button primary" href="/workspace?case=aarav">Open the synthetic case <ArrowRight size={16} /></Link>}
            </div>
        </article>
    </section>;
}
