import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Switch } from 'react-native';
import { json, useSession } from '../src/session';
import type { CaseSummary } from '../src/types';
import { Body, Button, Card, Heading, Input, Problem, Screen, message } from '../src/ui';

export default function CreateCase() {
  const { call } = useSession();
  const cache = useQueryClient();
  const [patientName, setName] = useState('');
  const [patientId, setPatientId] = useState('');
  const [hospitalName, setHospital] = useState('Green Valley Multispecialty Hospital');
  const [purpose, setPurpose] = useState<'preauthorization' | 'workflow-training'>('preauthorization');
  const [basis, setBasis] = useState<'synthetic-demonstration' | 'pending-review'>('synthetic-demonstration');
  const [confirmed, setConfirmed] = useState(false);
  const create = useMutation({
    mutationFn: () => call<CaseSummary>('/api/cases', json({
      patientName: patientName.trim(), patientId: patientId.trim(), hospitalName: hospitalName.trim(),
      processingAuthorization: { purpose, basis, categories: ['patient-identification'], recipients: ['hospital-desk'],
        noticeVersion: 'PP-NOTICE-2026-11-v1', staffConfirmed: confirmed, synthetic: true },
    })),
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
      <Body>Processing purpose</Body>
      <Button title="Pre-authorization draft" secondary={purpose !== 'preauthorization'} onPress={() => setPurpose('preauthorization')} />
      <Button title="Fictional workflow training" secondary={purpose !== 'workflow-training'} onPress={() => setPurpose('workflow-training')} />
      <Body>Processing basis</Body>
      <Button title="Synthetic demonstration" secondary={basis !== 'synthetic-demonstration'} onPress={() => setBasis('synthetic-demonstration')} />
      <Button title="Basis pending review" secondary={basis !== 'pending-review'} onPress={() => setBasis('pending-review')} />
      <Body>Notice PP-NOTICE-2026-11-v1 · Patient and admission identifiers are sent to the configured backend for the hospital desk. It stores the record locally. Ask the demo operator about privacy requests and retention.</Body>
      <Body>I confirm these fictional processing details as staff. Patient consent requires separate evidence.</Body>
      <Switch accessibilityLabel="Confirm fictional processing details as staff" value={confirmed} onValueChange={setConfirmed} />
      <Button title={create.isPending ? 'Creating…' : 'Create and open case'} disabled={create.isPending || !patientName.trim() || !hospitalName.trim() || !confirmed} onPress={() => create.mutate()} />
      {create.error && <Problem message={message(create.error)} />}
    </Card>
  </Screen>;
}
