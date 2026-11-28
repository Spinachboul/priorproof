export const annual = {
    name: 'IRDAI Annual Report 2024–25',
    url: 'https://irdai.gov.in/documents/37343/366637/%E0%A4%86%E0%A4%88%E0%A4%86%E0%A4%B0%E0%A4%A1%E0%A5%80%E0%A4%8F%E0%A4%86%E0%A4%88+%E0%A4%B5%E0%A4%BE%E0%A4%B0%E0%A5%8D%E0%A4%B7%E0%A4%BF%E0%A4%95+%E0%A4%B0%E0%A4%BF%E0%A4%AA%E0%A5%8B%E0%A4%B0%E0%A5%8D%E0%A4%9F+_+IRDAI+Annual+Report+2024-25.pdf/06f02832-66a3-6308-a16f-f46a6640fc93',
};
export const officialSources = {
    irdaReportCopy: 'https://lifeinscouncil.org/component/IRDAI%20Annual%20Report%202024-25.pdf',
    parliamentaryAnswer: 'https://sansad.in/getFile/annex/268/AU295_mNzd52.pdf?source=pqars',
};
const timelines = {
    name: 'IRDAI · Master Circular on Health Insurance Business',
    url: 'https://irdai.gov.in/document-detail?documentId=4942918',
};
const pmjay = { name: 'Ministry of Health and Family Welfare · PIB', url: 'https://www.pib.gov.in/PressReleasePage.aspx?PRID=2294278&reg=3&lang=1' };

export type Stat = {
    value: string; description: string; period: string; source: { name: string; url: string }; kind: 'Reported' | 'Derived'; note?: string;
};

export const industryStats: readonly Stat[] = [
    { value: '3.26 crore', description: 'Health insurance claims settled', period: 'FY 2024–25', source: annual, kind: 'Reported' },
    { value: '₹94,248 crore', description: 'Paid toward health claims settlements', period: 'FY 2024–25', source: annual, kind: 'Reported' },
    { value: '≈58%', description: 'Settled claims by count that were cashless only', period: 'FY 2024–25', source: annual, kind: 'Reported' },
    { value: '≈1.89 crore', description: 'Cashless-only settlements', period: 'FY 2024–25', source: annual, kind: 'Derived',
        note: '3.26 crore × 58%, rounded. IRDAI Table I.28 reports 188.95 lakh.' },
    { value: '1 hour', description: 'Maximum time for an insurer to decide on cashless authorization after receiving the request',
        period: 'IRDAI circular · 29 May 2024', source: timelines, kind: 'Reported' },
    { value: '3 hours', description: 'Maximum time for final authorization after the insurer receives the hospital’s discharge request',
        period: 'IRDAI circular · 29 May 2024', source: timelines, kind: 'Reported' },
    { value: '12.69 crore', description: 'Cumulative cashless hospital admissions authorized under AB-PMJAY',
        period: 'Through 30 June 2026', source: pmjay, kind: 'Reported' },
    { value: '₹1.92 lakh crore', description: 'Total value of hospital admissions authorized under AB-PMJAY',
        period: 'Through 30 June 2026', source: pmjay, kind: 'Reported' },
];

export const receivablesDisclosure = {
    title: 'Apollo Hospitals Enterprise · FY 2024–25 annual report',
    url: 'https://www.apollohospitals.com/sites/default/files/2025-08/annual-report_2025--1---1-.pdf',
    text: 'Apollo Hospitals Enterprise cited higher trade receivables and current investments in its explanation of a year-over-year current-ratio change.',
    period: 'FY 2024–25 · Management discussion, §7.2',
};
export const claimModes = [
    { name: 'Cashless only', value: 57.96, color: '#176e62' },
    { name: 'Reimbursement only', value: 36.68, color: '#638a80' },
    { name: 'Both modes', value: 1.33, color: '#bea070' },
    { name: 'Benefit-based', value: 4.03, color: '#49626b' },
];

type ExternalCase = {
    title: string;
    source: string;
    date: string;
    url: string;
    kind: string;
    summary: string;
    consequence: string;
    relevance: string;
    limit: string;
};

export const externalCases: readonly ExternalCase[] = [
    {
        title: 'Pre-authorization barriers in Maharashtra',
        source: 'Marathe et al. · BMC Health Services Research',
        date: '17 March 2025',
        url: 'https://doi.org/10.1186/s12913-025-12450-0',
        kind: 'study',
        summary: 'A mixed-methods study of PM-JAY and MJPJAY described late submission of required documentation as one factor in pre-authorization delays.',
        consequence: 'Interviewees described patients being billed privately when authorizations were delayed or rejected.',
        relevance: 'A requirements checklist and source-linked review can help a desk identify missing documents before submission.',
        limit: 'The study also reports policy, capacity and scheme administration problems beyond the scope of document preparation.',
    },
    {
        title: 'A ₹2.6 lakh reimbursement dispute in Bengaluru',
        source: 'Vindhya Pabolu · The Times of India',
        date: '20 December 2025',
        url: 'https://timesofindia.indiatimes.com/city/bengaluru/hospital-delay-no-excuse-bengaluru-consumer-panel-orders-insurer-to-pay-rs-2-6-lakh/articleshow/126080586.cms',
        kind: 'reporting',
        summary: 'The newspaper reported that late notification by a hospital was at issue in a reimbursement dispute brought before a Bengaluru district consumer commission.',
        consequence: 'The family paid more than ₹2.6 lakh up front. The report says the commission ordered the insurer to reimburse the expense.',
        relevance: 'A desk can use the workspace to track what documentation has been prepared and reviewed.',
        limit: 'This account relies on the published reporting. Hospitals handle notifications through their own channels and insurers decide reimbursement.',
    },
    {
        title: 'Families waiting for discharge authorization',
        source: 'Sanjay Mandal · The Telegraph',
        date: '29 December 2023',
        url: 'https://www.telegraphindia.com/my-kolkata/news/long-wait-for-insurance-companys-approval-returns-for-subscribers-to-health-insurance-policies/cid/1990032',
        kind: 'reporting',
        summary: 'Patients in Kolkata described waits of more than six and seven hours. Hospital representatives described repeated rounds of insurer clarification.',
        consequence: 'The patients spent additional hours at the hospital waiting for clearance to leave.',
        relevance: 'Source-linked drafts and explicit gaps can help staff prepare clearer responses to documentation questions.',
        limit: 'These examples describe patients’ experiences before the 2024 IRDAI circular. Current prevalence requires separate evidence.',
    },
];

type Segment = { title: string; description: string; relationship?: string; organizations?: readonly string[] };

export const customerSegments: readonly Segment[] = [
    {
        title: 'Hospitals',
        description: 'Help admissions and insurance desks build a traceable request, avoid repeating the same verification work, and see what staff still need to resolve across a case.',
        relationship: 'Prospective customer examples',
        organizations: ['Apollo Hospitals', 'Fortis', 'Max Healthcare', 'Manipal Hospitals', 'Medanta', 'Narayana Health', 'Yatharth Hospitals', 'regional multispeciality hospitals'],
    },
    {
        title: 'Insurers',
        description: 'A more consistent draft with traceable source material could make incoming requests easier to review and reduce avoidable clarification work. This is a hypothesis for a hospital pilot.',
        relationship: 'Insurance ecosystem examples',
        organizations: ['Star Health', 'Niva Bupa', 'Care Health', 'HDFC ERGO', 'ICICI Lombard', 'Tata AIG', 'SBI General'],
    },
    {
        title: 'Third-party administrators',
        description: 'A structured document checklist and explicit unresolved questions could help standardize exchanges between hospital desks, administrators and insurer teams.',
        relationship: 'TPA ecosystem examples',
        organizations: ['Medi Assist', 'MDIndia', 'FHPL', 'Vidal Health'],
    },
    {
        title: 'Patients and families',
        description: 'A clearer outstanding-document list could reduce repeated requests and help staff explain what information they need, why they need it and which questions are still open.',
    },
];

type Offering = { name: string; focus: string; url: string; reviewed: string; market?: 'US'; supportingSource?: string };
const marketReview = '28 November 2026';

export const competitors: readonly Offering[] = [
    { name: 'Vitraya Technologies', focus: 'A hospital claims portal for document checks before filing, pre-authorization and cashless claim processing, plus claim-status tracking across participating payers.', url: 'https://www.vitraya.com/for-hospitals', reviewed: marketReview },
    { name: 'IHX', focus: 'A health insurance information exchange for hospitals, insurers and TPAs, with digital workflows for cashless claims and structured payer-side processing.', url: 'https://www.ihx.in/', reviewed: marketReview },
    { name: 'Medi Assist', focus: 'Hospital-facing health benefits administration tools for submitting pre-authorization requests and tracking claims from intimation through settlement.', url: 'https://mediassist.in/hospital/', reviewed: marketReview },
    { name: 'ClaimBuddy', focus: 'Expert-assisted health insurance claim filing for patients and hospitals, including eligibility guidance and help arranging documentation.', url: 'https://www.claimbuddy.in/', reviewed: marketReview },
    { name: 'PreAuth', focus: 'Pre-launch software for Indian hospital desks using synthetic records. Its published workflow covers extraction, document gaps, an insurer-addressed draft letter and human review.', url: 'https://preauth.in/', reviewed: marketReview },
    { name: 'ClaimProc', focus: 'Markets AI-based pre-authorization and claims workflow software to hospital insurance desks in India, with attention to preparing submissions and tracking claims.', url: 'https://claimproc.ai/', reviewed: marketReview },
    { name: 'HRCM', focus: 'Offers managed hospital revenue-cycle operations with on-site desks, claim auditing, follow-up and reconciliation with hospital accounting systems.', url: 'https://www.hrcm.in/', reviewed: marketReview },
    { name: 'Caladrius Health AI Studio', focus: 'Describes hospital revenue intelligence spanning eligibility, pre-authorization, claim submission, denial handling and reconciliation for India and other markets.', url: 'https://caladriushealth.ai/platform/brief/', reviewed: marketReview },
    { name: 'Waystar', focus: 'Markets denial prevention and recovery tools, including claim monitoring and appeal workflows.', url: 'https://www.waystar.com/our-platform/denial-prevention-recovery/', reviewed: marketReview, market: 'US' },
    { name: 'Optum', focus: 'Digital Auth Complete covers prior-authorization preparation, submission workflows and post-submission status updates. Optum describes the product as powered by Humata Health.', url: 'https://business.optum.com/en/operations-technology/revenue-cycle-management/patient-access/digital-auth-complete.html', reviewed: marketReview, market: 'US' },
    { name: 'Humata Health (R1)', focus: 'Develops prior-authorization automation and powers R1 Phare Auth. R1 confirmed the acquisition had closed in its November 2026 announcement. Humata technology powering Optum’s product is a separate commercial relationship.', url: 'https://www.r1rcm.com/newsroom/r1-takes-aim-at-healthcares-fragmented-revenue-cycle-with-six-connected-phare-os-modules', supportingSource: 'https://business.optum.com/en/operations-technology/revenue-cycle-management/patient-access/digital-auth-complete.html', reviewed: marketReview, market: 'US' },
    { name: 'MD Clarity', focus: 'RevFind compares payer payments with documented contract terms and flags potential underpayments for review.', url: 'https://www.mdclarity.com/revfind', reviewed: marketReview, market: 'US' },
    { name: 'FinThrive', focus: 'Offers contract modeling that helps teams estimate expected payer reimbursement and analyze contract terms.', url: 'https://finthrive.com/solutions/contract-modeling', reviewed: marketReview, market: 'US' },
    { name: 'AKASA', focus: 'Describes an autonomous inpatient coding platform for coding and clinical documentation workflows.', url: 'https://akasa.com/', reviewed: marketReview, market: 'US' },
    { name: 'Infinx', focus: 'Offers remittance processing, exception management, payment posting and reconciliation support.', url: 'https://www.infinx.com/payment-posting-support/', reviewed: marketReview, market: 'US' },
];

type Capability = { title: string; detail: string; scope: 'Implemented' | 'Recently added' | 'Proposed' };

export const productStages: readonly Capability[] = [
    { title: 'Medical documents', scope: 'Implemented', detail: 'Upload records in the web workspace, or use the Expo app to capture a photo or upload a supporting PDF to the same authenticated case.' },
    { title: 'OCR', scope: 'Implemented', detail: 'Read text embedded in PDFs and use local optical character recognition for supported scans or images. Unreadable pages are surfaced for review.' },
    { title: 'Local LLM extraction', scope: 'Implemented', detail: 'With local Ollama configured, the model proposes structured values from the text. A deterministic mock provider lets the guided demo run without a model download.' },
    { title: 'Evidence validation', scope: 'Implemented', detail: 'Check proposed values against extracted source text. Staff can open supporting evidence, and unsupported proposals are excluded.' },
    { title: 'Missing document detection', scope: 'Implemented', detail: 'Compare available evidence with the case checklist and show staff outstanding items such as the fictional membership card.' },
    { title: 'Conflict detection', scope: 'Implemented', detail: 'Flag competing values, such as two admission dates, for staff to inspect against their sources. The published benchmark shows that detection can miss conflicts.' },
    { title: 'Agentic resolution', scope: 'Implemented', detail: 'Run a bounded preparation workflow that can stop for documents or a staff decision and resume after the case changes.' },
    { title: 'Human review', scope: 'Implemented', detail: 'Staff inspect the evidence, choose how to resolve conflicts and approve a packet before export.' },
    { title: 'Pre-authorization draft', scope: 'Implemented', detail: 'Generate a draft packet supported by case evidence. The demonstration can simulate a local submission. The insurer retains responsibility for coverage and authorization.' },
];

export const productCapabilities: readonly Capability[] = [
    { title: 'Evidence-linked preparation on web and mobile', scope: 'Implemented', detail: 'The workspace combines source-linked review, mobile capture and human checkpoints. Local inference is available through Ollama.' },
    { title: 'Document privacy intelligence', scope: 'Recently added', detail: 'Supported identifiers can be flagged for review. The workspace can show a masked text preview while authenticated originals, staff activity and retention controls stay within the case.' },
    { title: 'Hospital integration and production validation', scope: 'Proposed', detail: 'Hospital information system integration, organization-level access controls, managed security and independent assurance would need to be scoped for a pilot or production deployment.' },
];


export const integrityCapabilities: readonly Capability[] = [
    { title: 'Authorization Drift Intelligence', scope: 'Implemented', detail: 'Compare current and prior authorizations with the verified treatment estimate and flag the difference for administrative review.' },
    { title: 'Claim Digital Twin', scope: 'Implemented', detail: 'A versioned case timeline preserves what changed and the original evidence behind each recorded event.' },
    { title: 'Financial Evidence Graph', scope: 'Implemented', detail: 'Follow source documents, page references and calculation inputs from a financial amount or finding.' },
    { title: 'Financial Integrity and Reconciliation', scope: 'Implemented', detail: 'Compare documented bill adjustments, expected reimbursement and posted receipts using integer paise.' },
    { title: 'Patient Financial Transparency', scope: 'Implemented', detail: 'Give staff a preview and review gate for an explanation of verified patient responsibility and open questions.' },
    { title: 'Counterfactual Administrative Resolution', scope: 'Implemented', detail: 'Compare hypothetical estimate, authorization or payment changes while preserving the recorded case.' },
    { title: 'Payer Intelligence', scope: 'Recently added', detail: 'The guided case uses a fixed fictional profile. Other synthetic Northstar cases can review, approve and pin a revised version. Generic verification remains available.' },
    { title: 'Closed-loop Outcome Intelligence', scope: 'Recently added', detail: 'Record fictional outcomes and surface candidate checklist improvements for staff review. Wider pilot validation remains proposed.' },
];
