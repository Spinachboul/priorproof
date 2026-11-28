import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useCase } from '../../../src/queries';
import { json, useSession } from '../../../src/session';
import { casePath, type EvidenceField, type Source } from '../../../src/types';
import { Body, Button, Card, Heading, Input, Loading, Problem, Screen, Title, message } from '../../../src/ui';

export default function Evidence() {
  const { id, fieldIds } = useLocalSearchParams<{ id: string; fieldIds?: string }>();
  const { call } = useSession();
  const cache = useQueryClient();
  const record = useCase(id);
  const [opening, setOpening] = useState<{ field: EvidenceField; revision: string } | null>(null);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const field = opening?.field;
  const source = useQuery({
    queryKey: ['source', id, field?.id, opening?.revision],
    queryFn: () => call<Source>(casePath(id) + '/evidence/' + field?.id),
    enabled: !!field?.source_doc,
    gcTime: 0,
  });

  const review = useMutation({
    mutationFn: (decision: 'Verified' | 'Edited' | 'Rejected' | 'Unable to Verify') => {
      if (!opening) throw new Error('Select a field to review.');
      return call(casePath(id) + '/review/' + opening.field.id, {
        ...json({ review: decision, value: decision === 'Edited' ? value.trim() : undefined, expectedRevision: opening.revision }),
        method: 'PUT',
      });
    },
    onSuccess: () => { setOpening(null); setEditing(false); setValue(''); },
    onSettled: async () => {
      await Promise.all([
        cache.invalidateQueries({ queryKey: ['case', id] }),
        cache.invalidateQueries({ queryKey: ['agent', id] }),
        cache.invalidateQueries({ queryKey: ['cases'] }),
      ]);
    },
  });

  function open(item: EvidenceField) {
    if (!record.data) return;
    setOpening({ field: item, revision: record.data.updatedAt });
    setEditing(false);
    setValue(item.value);
    review.reset();
  }

  const allowed = fieldIds?.split(',');
  const fields = record.data?.fields.filter(item => !allowed || allowed.includes(item.id)) ?? [];
  const stale = !!opening && record.data?.updatedAt !== opening.revision;
  const disabled = review.isPending || stale || record.data?.status === 'Processing';
  return <Screen>
    <Heading>Evidence review</Heading>
    {record.isPending && <Loading />}
    {record.isError && <><Problem message={message(record.error)} /><Button title="Retry" onPress={() => { void record.refetch(); }} /></>}
    {field ? <Card>
      <Title>{field.name}</Title><Body>{field.value} · {field.review}</Body>
      <Body>{field.source_name || 'Staff entry'}{field.page ? ` · Page ${field.page}` : ''} · {field.evidenceStatus}</Body>
      {field.source_doc && source.isPending && <Loading />}
      {source.isError && <><Problem message={message(source.error)} /><Button title="Retry source" secondary onPress={() => { void source.refetch(); }} /></>}
      {source.data && <><Title>Supporting excerpt</Title><Body>{source.data.evidence || 'This field has no recorded source excerpt.'}</Body></>}
      {stale && <Problem message="The case changed. Return to the field list and reopen the updated evidence." />}
      {editing ? <>
        <Input label="Reviewed value" value={value} onChangeText={setValue} maxLength={4000} multiline />
        <Button title="Save staff edit" disabled={disabled || !value.trim()} onPress={() => review.mutate('Edited')} />
        <Button title="Cancel edit" secondary onPress={() => { setEditing(false); setValue(field.value); }} disabled={review.isPending} />
      </> : <>
        <Button title="Verify value" disabled={disabled || (Boolean(field.source_doc) && !source.data)} onPress={() => review.mutate('Verified')} />
        <Button title="Edit value" secondary disabled={disabled} onPress={() => setEditing(true)} />
        <Button title="Reject value" secondary disabled={disabled} onPress={() => review.mutate('Rejected')} />
        <Button title="Unable to verify" secondary disabled={disabled} onPress={() => review.mutate('Unable to Verify')} />
      </>}
      <Button title="Back to fields" secondary disabled={review.isPending} onPress={() => { setOpening(null); setEditing(false); setValue(''); }} />
    </Card> : <>
      {record.isSuccess && !fields.length && <Body>No matching fields are available.</Body>}
      {fields.map(item => <Card key={item.id}>
        <Title>{item.name}</Title><Body>{item.value} · {item.review}</Body>
        <Button title="Open evidence" secondary onPress={() => open(item)} />
      </Card>)}
    </>}
    {review.error && <Problem message={message(review.error)} />}
  </Screen>;
}
