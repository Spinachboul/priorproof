import { router, useLocalSearchParams } from 'expo-router';
import { useAgent, useCase } from '../../../src/queries';
import { Body, Button, Card, Heading, Loading, Problem, Screen, Title, message } from '../../../src/ui';

export default function Details() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const record = useCase(id);
  const agent = useAgent(id);
  if (!record.data) return <Screen>{record.isError ? <>
    <Problem message={message(record.error)} /><Button title="Retry" onPress={() => { void record.refetch(); }} />
  </> : <Loading />}</Screen>;
  const item = record.data;
  const run = agent.data;
  const missing = item.checklist.filter(row => row.status === 'Missing');
  return <Screen>
    <Heading>{item.patientName || 'New patient'}</Heading>
    <Body>{[item.patientId, item.hospitalName, item.admissionDate, item.insurer].filter(Boolean).join(' · ')}</Body>
    <Button title="Capture documents" onPress={() => router.push({ pathname: '/case/[id]/capture', params: { id } })} />
    <Button title={`Agent tasks${run?.tasks.length ? ` · ${run.tasks.length}` : ''}`} secondary onPress={() => router.push({ pathname: '/case/[id]/tasks', params: { id } })} />
    {record.isError && <Problem message={message(record.error)} />}
    {agent.isError && <Problem message={message(agent.error)} />}
    <Card><Title>Readiness · {item.readiness.score}%</Title>
      <Body>{item.status} · {item.readiness.blockers.length} preparation blockers</Body>
      <Body>{run ? run.current_task : 'Start agent preparation from the website.'}</Body>
    </Card>
    <Card><Title>Documents</Title>
      {item.documents.map(doc => <Body key={doc.id}>{doc.filename} · {doc.category} · {doc.status}</Body>)}
      {!item.documents.length && <Body>No documents uploaded.</Body>}
      {missing.length > 0 && <><Title>Missing documents</Title>
        {missing.map(row => <Body key={row.requirement}>{row.requirement}</Body>)}</>}
    </Card>
    <Card><Title>Conflicts</Title>
      {item.conflicts.length === 0 && <Body>No open conflicts.</Body>}
      {item.conflicts.map(conflict => <Body key={conflict.field}>{conflict.field} · {conflict.values.map(value => value.value).join(' / ')}</Body>)}
      <Button title="Review evidence" secondary onPress={() => router.push({ pathname: '/case/[id]/evidence', params: { id } })} />
    </Card>
    <Button title="Financial summary" secondary onPress={() => router.push({ pathname: '/case/[id]/financial', params: { id } })} />
    <Button title="Draft packet" secondary onPress={() => router.push({ pathname: '/case/[id]/packet', params: { id } })} />
  </Screen>;
}
