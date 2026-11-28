import { useQuery } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import { useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useState } from 'react';
import { Image } from 'react-native';
import { discard } from '../../../src/files';
import { useAgent } from '../../../src/queries';
import { useSession } from '../../../src/session';
import { casePath } from '../../../src/types';
import { Body, Button, Card, Heading, Loading, Problem, Screen, Title, message } from '../../../src/ui';

type Preview = { page: number; pages: number; width: number; height: number; png: string };

export default function Packet() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { call, session, signOut } = useSession();
  const agent = useAgent(id);
  const [page, setPage] = useState(1);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState('');
  const run = agent.data;
  const path = run?.packet;
  const preview = useQuery({
    queryKey: ['draft-preview', id, path, page],
    queryFn: () => call<Preview>(casePath(id) + '/packet-preview?revision=' + encodeURIComponent(run!.current_revision) + '&page=' + page),
    enabled: !!path && !agent.isError,
    gcTime: 0,
  });

  async function share() {
    if (!session || !path) return;
    setSharing(true);
    setError('');
    let directory: string | undefined;
    try {
      if (!(await Sharing.isAvailableAsync()) || !FileSystem.cacheDirectory) throw new Error('File sharing is unavailable on this device.');
      directory = FileSystem.cacheDirectory + 'priorproof-draft-' + randomUUID();
      await FileSystem.makeDirectoryAsync(directory);
      const result = await FileSystem.downloadAsync(session.server + path, directory + '/PriorProof_PreAuthorization_Draft.pdf', {
        headers: { Authorization: 'Bearer ' + session.token },
      });
      if (result.status === 401) { await signOut(); return; }
      if (result.status !== 200 || (result.mimeType && !result.mimeType.includes('application/pdf'))) {
        throw new Error(result.status === 409 ? 'The case changed. Prepare a current draft before sharing.' : 'The draft could not be downloaded.');
      }
      await Sharing.shareAsync(result.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: 'Save or share PriorProof draft' });
    } catch (failure) {
      setError(message(failure));
    } finally {
      if (directory) await discard(directory);
      setSharing(false);
    }
  }

  return <Screen><Heading>Draft packet</Heading>
    <Card><Title>Pre-authorization draft</Title>
      <Body>For authorized staff review only. Insurance approval and submission require separate staff action.</Body>
      {agent.isPending && <Loading />}
      {agent.isSuccess && !path && <Body>Approve preparation from Agent tasks once the case is ready. That approval applies to the current case revision.</Body>}
      {agent.isError && <Problem message={message(agent.error)} />}
      {path && <Button title={sharing ? 'Preparing to share…' : 'Save or share PDF'} disabled={sharing || agent.isError} onPress={share} />}
      {error && <Problem message={error} />}
    </Card>
    {path && !agent.isError && <Card><Title>PDF preview</Title>
      {preview.isPending && <Loading />}
      {preview.isError && <><Problem message={message(preview.error)} />
        <Button title="Return to first page" secondary onPress={() => { if (page === 1) void preview.refetch(); else setPage(1); }} /></>}
      {preview.data && <>
        <Image source={{ uri: 'data:image/png;base64,' + preview.data.png }} accessibilityLabel={`Draft PDF page ${page}`}
          resizeMode="contain" style={{ width: '100%', aspectRatio: preview.data.width / preview.data.height }} />
        <Body>Page {page} of {preview.data.pages}</Body>
        {page > 1 && <Button title="Previous page" secondary onPress={() => setPage(page - 1)} />}
        {page < preview.data.pages && <Button title="Next page" secondary onPress={() => setPage(page + 1)} />}
      </>}
    </Card>}
  </Screen>;
}
