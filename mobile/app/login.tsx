import * as SecureStore from 'expo-secure-store';
import { useEffect, useState } from 'react';
import { Switch, View } from 'react-native';
import { savedKeyName, serverOrigin, useSession } from '../src/session';
import { Body, Button, Card, Heading, Input, Problem, Screen, message } from '../src/ui';

export default function Login() {
  const { login, lastServer } = useSession();
  const [server, setServer] = useState(lastServer);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [remember, setRemember] = useState(false);
  const [loadingKey, setLoadingKey] = useState(true);

  useEffect(() => {
    let active = true;
    SecureStore.getItemAsync(savedKeyName).then(value => {
      if (!active || !value) return;
      const saved = JSON.parse(value);
      if (typeof saved.key !== 'string' || serverOrigin(saved.server) !== saved.server) return;
      setServer(saved.server);
      setKey(saved.key);
      setRemember(true);
    }).catch(() => {}).finally(() => { if (active) setLoadingKey(false); });
    return () => { active = false; };
  }, []);

  async function connect() {
    setBusy(true);
    setError('');
    try {
      await login(server, key, remember);
      setKey('');
    }
    catch (failure) { setError(message(failure)); }
    finally { setBusy(false); }
  }

  return <Screen>
    <Heading>PriorProof</Heading>
    <Body>Connect to your hospital desk’s PriorProof server.</Body>
    <Card>
      <Input label="Backend URL" placeholder="http://192.168.1.20:8000" autoCapitalize="none" autoCorrect={false} keyboardType="url" value={server} editable={!busy && !loadingKey} onChangeText={value => { setServer(value); setKey(''); }} />
      <Input label="Demo access key" autoCapitalize="none" autoCorrect={false} value={key} onChangeText={setKey} editable={!busy && !loadingKey} secureTextEntry />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Body>Remember demo key on this device</Body>
        <Switch accessibilityLabel="Remember demo key on this device" value={remember} disabled={busy || loadingKey} onValueChange={async enabled => {
          if (!enabled) {
            try { await SecureStore.deleteItemAsync(savedKeyName); }
            catch (failure) { setError(message(failure)); return; }
          }
          setRemember(enabled);
        }} />
      </View>
      <Button title={busy ? 'Connecting…' : 'Connect and sign in'} onPress={connect} disabled={busy || loadingKey || !server.trim() || !key} />
      {error && <Problem message={error} />}
      {server.trim().startsWith('http:') && <Body>LAN HTTP is unencrypted. Use trusted Wi-Fi and fictional records.</Body>}
    </Card>
  </Screen>;
}
