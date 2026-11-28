import Constants from 'expo-constants';
import { useState } from 'react';
import { URL } from 'react-native-url-polyfill';
import { serverOrigin, useSession } from '../src/session';
import { Body, Button, Card, Heading, Input, Problem, Screen, message } from '../src/ui';

function defaultDemoServer() {
  const configured = process.env.EXPO_PUBLIC_API_URL;
  if (configured) return configured;
  const metroHost = Constants.expoConfig?.hostUri;
  if (!__DEV__ || !metroHost) return '';
  try {
    const { hostname } = new URL('http://' + metroHost);
    if (hostname === 'localhost' || hostname === '127.0.0.1') return '';
    return serverOrigin(`http://${hostname}:8001`);
  } catch {
    return '';
  }
}

export default function Login() {
  const { loginDemo, lastServer } = useSession();
  const [server, setServer] = useState(() => defaultDemoServer() || lastServer);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function connect() {
    setBusy(true);
    setError('');
    try {
      await loginDemo(server);
    } catch (failure) {
      setError(message(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Heading>PriorProof</Heading>
      <Body>Connect to the fictional demo server.</Body>
      <Card>
        <Input
          label="Backend URL"
          placeholder="http://192.168.1.20:8001"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          value={server}
          editable={!busy}
          onChangeText={value => { setServer(value); setError(''); }}
        />
        {/* Access-key sign-in is available in the web workspace. */}
        <Button
          title={busy ? 'Connecting…' : 'Sign in as demo user'}
          onPress={connect}
          disabled={busy || !server.trim()}
        />
        {error && <Problem message={error} />}
        {server.trim().startsWith('http:') && (
          <Body>LAN HTTP is unencrypted. Use trusted Wi-Fi and fictional records.</Body>
        )}
      </Card>
    </Screen>
  );
}
