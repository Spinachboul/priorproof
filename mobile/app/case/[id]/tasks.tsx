import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useAgent, useCase } from '../../../src/queries';
import { json, useSession } from '../../../src/session';
import { casePath, runsPath, taskLabels, type AgentRun, type Task } from '../../../src/types';
import { Body, Button, Card, Heading, Input, Loading, Problem, Screen, Title, message } from '../../../src/ui';

export default function Tasks() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { call } = useSession();
  const cache = useQueryClient();
  const record = useCase(id);
  const agent = useAgent(id);
  const run = agent.data;
  const base = runsPath(id) + '/' + run?.run_id;
  const [staffTask, setStaffTask] = useState<Task | null>(null);
  const [value, setValue] = useState('');

  async function refresh() {
    await Promise.all([
      cache.invalidateQueries({ queryKey: ['agent', id] }),
      cache.invalidateQueries({ queryKey: ['case', id] }),
      cache.invalidateQueries({ queryKey: ['cases'] }),
    ]);
  }

  const advance = useMutation({
    mutationFn: async (task?: Task) => {
      if (!run) throw new Error('Start preparation on the website first.');
      if (task) await call(base + '/input', json({ task_id: task.id, revision: run.current_revision, confirmed: true }));
      return call<AgentRun>(base + '/resume', { method: 'POST' });
    },
    onSuccess: updated => cache.setQueryData(['agent', id], updated),
    onSettled: refresh,
  });

  const staff = useMutation({
    mutationFn: () => {
      if (!record.data || !staffTask) throw new Error('Choose an essential field first.');
      return call(casePath(id) + '/fields', json({ name: staffTask.subject, value: value.trim(), expectedRevision: record.data.updatedAt }));
    },
    onSuccess: () => { setStaffTask(null); setValue(''); },
    onSettled: refresh,
  });
  const busy = advance.isPending || staff.isPending;
  const blocked = record.data?.status === 'Processing' || agent.isError;

  function openTask(task: Task) {
    if (task.kind === 'missing_document' || task.kind === 'missing_field') {
      router.push({ pathname: '/case/[id]/capture', params: { id, category: task.kind === 'missing_document' ? task.subject : undefined } });
    } else if (task.field_ids.length) {
      router.push({ pathname: '/case/[id]/evidence', params: { id, fieldIds: task.field_ids.join(',') } });
    } else {
      setStaffTask(task);
      setValue('');
    }
  }

  return <Screen>
    <Heading>Agent tasks</Heading>
    {agent.isPending && <Loading />}
    {agent.isError && <><Problem message={message(agent.error)} /><Button title="Retry" onPress={() => { void agent.refetch(); }} /></>}
    {agent.isSuccess && !run && <Body>Start preparation from Agent Activity on the website.</Body>}
    {run && <>
      <Card><Title>{run.status === 'waiting' ? 'Waiting for staff' : run.status === 'completed' ? 'Draft prepared' : run.status}</Title>
        <Body>{run.current_task}</Body>
        {run.warnings.map(warning => <Body key={warning}>{warning}</Body>)}
        {run.errors.map(error => <Problem key={error} message={error} />)}
      </Card>
      {run.interrupted && run.tasks.map(task => <Card key={task.id}>
        <Title>{task.subject}</Title><Body>{taskLabels[task.kind]}</Body>
        {task.kind !== 'approve_draft' && <Button title={
          task.kind === 'missing_document' || task.kind === 'missing_field' ? 'Capture supporting document' :
            task.field_ids.length ? 'Open evidence' : 'Enter verified value'
        } secondary onPress={() => openTask(task)} disabled={busy} />}
        {task.kind === 'missing_field' && <Button title="Enter verified value" secondary disabled={busy} onPress={() => { setStaffTask(task); setValue(''); }} />}
        <Button title={task.kind === 'approve_draft' ? 'Approve draft preparation' : 'Confirm update and resume'}
          disabled={busy || blocked || (task.kind === 'approve_draft'
            ? run.current_revision !== run.revision
            : run.current_revision === run.revision)} onPress={() => advance.mutate(task)} />
      </Card>)}
      {(run.input_received || run.status === 'running' || (run.status === 'waiting' && !run.interrupted)) &&
        <Button title="Resume agent" disabled={busy || blocked} secondary onPress={() => advance.mutate(undefined)} />}
      {run.packet && <Button title="Open draft packet" onPress={() => router.push({ pathname: '/case/[id]/packet', params: { id } })} />}
    </>}
    {staffTask && <Card><Title>{staffTask.subject}</Title>
      <Body>Record only a value you have checked. The draft will identify it as a staff entry without a linked source.</Body>
      <Input label="Staff-verified value" value={value} onChangeText={setValue} maxLength={4000} />
      <Button title="Confirm checked value" disabled={!value.trim() || busy || !record.data} onPress={() => staff.mutate()} />
      <Button title="Cancel entry" secondary disabled={busy} onPress={() => setStaffTask(null)} />
    </Card>}
    {busy && <Loading />}
    {advance.error && <Problem message={message(advance.error)} />}
    {staff.error && <Problem message={message(staff.error)} />}
  </Screen>;
}
