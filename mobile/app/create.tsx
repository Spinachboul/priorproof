import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { json, useSession } from '../src/session';
import type { CaseSummary } from '../src/types';
import { Body, Button, Card, Heading, Input, Problem, Screen, message } from '../src/ui';

export default function CreateCase() {
  const { call } = useSession();
  const cache = useQueryClient();
  const [patientName, setName] = useState('');
  const [patientId, setPatientId] = useState('');
  const [hospitalName, setHospital] = useState('Green Valley Multispecialty Hospital');
  const create = useMutation({
    mutationFn: () => call<CaseSummary>('/api/cases', json({ patientName: patientName.trim(), patientId: patientId.trim(), hospitalName: hospitalName.trim() })),
    onSuccess: item => {
      void cache.invalidateQueries({ queryKey: ['cases'] });
      router.replace({ pathname: '/case/[id]', params: { id: item.id } });
    },
  });
  return <Screen><Heading>Create case</Heading><Body>Enter fictional patient and hospital details for the demo.</Body>
    <Card>
      <Input label="Patient name" value={patientName} onChangeText={setName} maxLength={200} />
      <Input label="Patient ID" value={patientId} onChangeText={setPatientId} maxLength={100} />
      <Input label="Hospital" value={hospitalName} onChangeText={setHospital} maxLength={250} />
      <Button title={create.isPending ? 'Creating…' : 'Create and open case'} disabled={create.isPending || !patientName.trim() || !hospitalName.trim()} onPress={() => create.mutate()} />
      {create.error && <Problem message={message(create.error)} />}
    </Card>
  </Screen>;
}
