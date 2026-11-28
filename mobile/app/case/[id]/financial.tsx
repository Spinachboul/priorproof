import { router, useLocalSearchParams } from 'expo-router';
import { useFinancialSummary } from '../../../src/queries';
import { Body, Button, Card, Heading, Loading, Problem, Screen, Title, message } from '../../../src/ui';

const labels: Record<string, string> = {
  estimate: 'Estimated treatment cost', authorization: 'Recorded authorization',
  authorization_gap: 'Estimate-to-authorization difference', bill: 'Latest hospital bill',
  adjustment: 'Documented billing adjustment', responsibility: 'Verified patient responsibility',
  received: 'Confirmed insurer receipts',
};

export default function FinancialSummary() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const state = useFinancialSummary(id);
  const data = state.data;
  return <Screen>
    <Heading>Financial summary</Heading>
    {state.isPending && <Loading />}
    {state.isError && <><Problem message={message(state.error)} /><Button title="Retry" onPress={() => { void state.refetch(); }} /></>}
    {data && <Card>
      <Title>{data.reviewed ? 'Staff-reviewed case revision' : 'Requires staff review'}</Title>
      {!data.stage && <Body>No verified financial events yet. Open Claim Integrity on the website to begin.</Body>}
      {!!data.stage && Object.entries(labels).map(([key, label]) => <Body key={key}>{label} · {
        data.amounts[key] === undefined ? 'Unknown' : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(data.amounts[key] / 100)
      }</Body>)}
      <Body>Recorded authorization and insurer payment differences are separate from the patient’s verified responsibility.</Body>
    </Card>}
    {data?.findings.map(finding => <Card key={finding.id}><Title>{finding.category}</Title><Body>{finding.status} · {finding.action}</Body></Card>)}
    <Button title="Capture financial evidence" onPress={() => router.push({ pathname: '/case/[id]/capture', params: { id, category: 'Financial claim evidence' } })} />
    <Button title="Financial review tasks" secondary onPress={() => router.push({ pathname: '/case/[id]/tasks', params: { id, mode: 'integrity' } })} />
  </Screen>;
}
