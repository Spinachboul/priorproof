import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { useSession } from '../src/session';
import type { CaseSummary } from '../src/types';
import { Body, Button, Card, Heading, Input, Loading, Problem, Screen, Title, message } from '../src/ui';

export default function Home() {
  const { call, session, signOut } = useSession();
  const list = useQuery({ queryKey: ['cases'], queryFn: () => call<CaseSummary[]>('/api/cases'), refetchInterval: 6000 });
  const [term, setTerm] = useState('');
  const [error, setError] = useState('');
  const cases = (list.data ?? []).filter(item => `${item.patientName} ${item.patientId} ${item.status}`.toLowerCase().includes(term.trim().toLowerCase()));
  const needsAction = (list.data ?? []).filter(item => ['Draft', 'Documents Uploaded', 'Needs Review', 'Missing Information', 'Processing Failed'].includes(item.status)).length;
  return <Screen>
    <Heading>Patient cases</Heading>
    <Body>{list.isSuccess ? 'Connected' : list.isError ? 'Connection unavailable' : 'Checking connection'} · {session?.server}</Body>
    <Button title="Scan case QR" onPress={() => router.push('/scan')} />
    <Button title="Create case" secondary onPress={() => router.push('/create')} />
    <Input label="Search cases" placeholder="Patient, case ID, or status" value={term} onChangeText={setTerm} />
    {list.isPending && <Loading />}
    {list.isError && <><Problem message={message(list.error)} /><Button title="Retry connection" onPress={() => { void list.refetch(); }} /></>}
    {list.isSuccess && <Title>Cases needing action · {needsAction}</Title>}
    {list.isSuccess && !cases.length && <Body>No matching cases.</Body>}
    {cases.map(item => <Card key={item.id}>
      <Title>{item.patientName || 'New patient'}</Title>
      <Body>{item.status} · {item.documentCount ?? 0} documents</Body>
      <Button title={`Open ${item.patientId || 'case'}`} secondary onPress={() => router.push({ pathname: '/case/[id]', params: { id: item.id } })} />
    </Card>)}
    {error && <Problem message={error} />}
    <Button title="Sign out" secondary onPress={() => { void signOut().catch(failure => setError(message(failure))); }} />
  </Screen>;
}
