export type CaseSummary = {
  id: string; patientName: string; patientId: string; hospitalName: string; insurer: string;
  admissionDate: string; status: string; updatedAt: string; documentCount?: number;
};
export type EvidenceField = {
  id: string; name: string; value: string; source_doc: string | null; source_name: string | null;
  page: number | null; evidenceStatus: string; review: string;
};
export type CaseDetails = CaseSummary & {
  documents: { id: string; filename: string; category: string; pages: number; status: string }[];
  fields: EvidenceField[];
  checklist: { requirement: string; status: string }[];
  conflicts: { field: string; values: { fieldId: string; value: string }[] }[];
  readiness: { score: number; blockers: { subject: string; why: string }[]; essentialFields: string[] };
};
export type Source = { field: EvidenceField; filename: string; page: number | null; evidence: string };
export type Task = {
  id: string;
  kind: 'missing_document' | 'missing_field' | 'conflict' | 'verify_evidence' | 'approve_draft';
  subject: string;
  field_ids: string[];
};
export type AgentRun = {
  run_id: string; status: string; current_task: string; revision: string; current_revision: string;
  interrupted: boolean; input_received: boolean; packet?: string;
  tasks: Task[]; warnings: string[]; errors: string[];
};
export const taskLabels: Record<Task['kind'], string> = {
  missing_document: 'Upload a required document',
  missing_field: 'Supply the source or a staff-verified value',
  conflict: 'Resolve conflicting evidence',
  verify_evidence: 'Review source evidence',
  approve_draft: 'Approve PDF draft preparation',
};
export const categories = [
  'Admission notes', 'Clinical notes', 'Diagnostic reports', 'Treatment plans', 'Prescriptions',
  'Cost estimates', 'Insurance policy', 'Insurance identification', 'Other supporting documents',
];
export const casePath = (id: string) => '/api/cases/' + encodeURIComponent(id);
export const runsPath = (id: string) => casePath(id) + '/agent/runs';
