const act = 'https://www.indiacode.nic.in/bitstream/123456789/22037/1/a2023-22.pdf';
const commencement = 'https://upload.indiacode.nic.in/showfile?actid=AC_CEN_45_0_00003_2023-22_1763464807080&filename=c56ceae6c383460ca69577428d36828b.pdf&type=hindinotification';
const rules = 'https://www.meity.gov.in/static/uploads/2025/11/53450e6e5dc0bfa85ebd78686cadad39.pdf';
const notices = 'https://www.meity.gov.in/documents/act-and-policies/digital-personal-data-protection-rules-2025-gDOxUjMtQWa';

const controls = [
    ['Act §5 · Rules r.3', 'Make the purpose, categories and rights channels understandable.',
        'Partially implemented', 'Versioned demo notice, case creation confirmation and a financial claim records processing category.',
        'The hospital must provide its own notice, appropriate language choices and usable rights channels.'],
    ['Act §6', 'Record and manage consent where applicable.',
        'Requires organizational or legal action', 'Case records distinguish a staff confirmation from consent reported elsewhere.',
        'Patient consent, proof, withdrawal and downstream propagation require an organizational process.'],
    ['Act §7', 'Determine whether a specified legitimate use applies.',
        'Requires organizational or legal action', 'A staff-selected basis is recorded with an actor and timestamp.',
        'The prototype cannot decide whether statutory conditions apply.'],
    ['Act §8 · Rules r.6', 'Protect personal data and make access reviewable.',
        'Partially implemented', 'Case-scoped original access, masked payment references, revision-bound reporting and metadata-only audit support staff review.',
        'Individual identity, role permissions, encryption, monitoring, backup and applicable log retention require deployment controls.'],
    ['Act §11', 'Support access to information about personal data processing.',
        'Partially implemented', 'Processing summary export and access request record.',
        'Identity verification, disclosures, and a complete rights response remain organizational work.'],
    ['Act §12', 'Support correction and erasure with applicable retention restrictions.',
        'Partially implemented', 'Correction and erasure register. Regression tests cover blocked deletion and local cleanup.',
        'The hospital decides retention obligations, handles backups and recalls copies where possible.'],
    ['Act §13 · Rules r.14', 'Provide usable rights and grievance procedures.',
        'Partially implemented', 'Administrative grievance register, recorded outcomes and dated history.',
        'Publish verified channels and response timelines. Assign a grievance owner and handle requests externally.'],
    ['Rules r.7', 'Notify affected people and the Board when required.',
        'Requires organizational or legal action', 'The repository includes an incident response procedure and the app records security events.',
        'Operators assess incidents and issue notifications. The prototype has no notification service.'],
];

export function RegulatoryReadiness() {
    return <section className="public-section" id="regulatory-readiness">
        <div className="public-panel">
            <h2>Regulatory Readiness</h2>
            <p>Control mapping for this fictional prototype, checked on 28 November 2026. Status describes implementation progress. It confers no certification or approval for patient data.</p>
            <p>The listed Act provisions and Rules 3, 6, 7 and 14 are scheduled for 13 May 2027 through the eighteen-month commencement provisions. Section 6(9), concerning Consent Managers, commenced separately on 13 November 2026.</p>
            <p><a href={act}>DPDP Act, 2023</a> · <a href={commencement}>Act commencement notification</a> · <a href={rules}>DPDP Rules, 2025</a> · <a href={notices}>MeitY notices and corrigendum</a></p>
            <div className="tablewrap regulatory-table"><table>
                <thead><tr>{['Reference', 'Control objective', 'Status', 'Evidence', 'Remaining work'].map(item => <th scope="col" key={item}>{item}</th>)}</tr></thead>
                <tbody>{controls.map(([reference, objective, status, evidence, remaining]) => <tr key={reference}>
                    <th scope="row">{reference}</th><td>{objective}</td><td><strong>{status}</strong></td><td>{evidence}</td><td>{remaining}</td>
                </tr>)}</tbody>
            </table></div>
        </div>
    </section>;
}

export function PrivacyNotice() {
    return <section className="public-section" id="patient-privacy">
        <div className="public-panel">
            <h2>Patient Privacy</h2>
            <p><strong>Notice PP-NOTICE-2026-11-v1</strong> · Fictional demonstration</p>
            <p>PriorProof collects case details, supporting documents and staff decisions to prepare an evidence-linked pre-authorization draft and, when authorized in the case, review authorization, billing and payment evidence. The backend stores originals, extracted text and case metadata on the device hosting the API. Local extraction and optional loopback Ollama processing support staff review. A browser or phone sends records to the configured backend.</p>
            <p>Signed-in demo staff can review, export and delete cases available to the shared account. No insurer submission takes place in this demo. Retention review dates and holds are recorded per case. Staff decide when deletion may proceed. Financial PDFs use the current staff-reviewed revision. The patient summary omits the patient name, payment references and contractual excerpts. Downloaded copies and backups require separate handling.</p>
            <p>Contact the person running this demo to raise a privacy question. Signed-in staff can record an access, correction, erasure or grievance request in the case privacy panel. Staff confirmation records an administrative action. Patient consent requires separate evidence where applicable.</p>
        </div>
    </section>;
}
