import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { View } from 'react-native';
import { useSession } from '../src/session';
import { casePath, type CaseDetails } from '../src/types';
import { Body, Button, Heading, Problem, Screen, message } from '../src/ui';

const caseId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function Scan() {
  const [permission, ask] = useCameraPermissions();
  const { call } = useSession();
  const locked = useRef(false);
  const [error, setError] = useState('');
  const [paused, setPaused] = useState(false);
  async function open(value: string) {
    if (locked.current) return;
    locked.current = true;
    setPaused(true);
    try {
      if (!caseId.test(value)) throw new Error('Scan a case QR displayed in PriorProof.');
      const record = await call<CaseDetails>(casePath(value.toLowerCase()));
      router.replace({ pathname: '/case/[id]', params: { id: record.id } });
    } catch (failure) {
      setError(message(failure));
    }
  }
  return <Screen><Heading>Scan case QR</Heading><Body>Use the case QR displayed in the website’s Agent Activity panel.</Body>
    {permission?.granted ? <>
      {!paused && <View style={{ height: 340, overflow: 'hidden', borderRadius: 14 }}>
        <CameraView style={{ flex: 1 }} barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={({ data }) => { void open(data); }} />
      </View>}
      {error && <><Problem message={error} /><Button title="Scan again" onPress={() => { locked.current = false; setPaused(false); setError(''); }} /></>}
    </> : <Button title="Allow camera access" onPress={() => { void ask(); }} />}
  </Screen>;
}
