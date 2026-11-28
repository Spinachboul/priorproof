import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SessionProvider, useSession } from '../src/session';
import { colors, Loading, Screen } from '../src/ui';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 30000, staleTime: 3000 } } });

function Navigation() {
  const { session, loading } = useSession();
  if (loading) return <Screen><Loading /></Screen>;
  return <Stack screenOptions={{ headerTintColor: colors.teal, headerBackButtonDisplayMode: 'minimal' }}>
    <Stack.Protected guard={!session}>
      <Stack.Screen name="login" options={{ headerShown: false }} />
    </Stack.Protected>
    <Stack.Protected guard={!!session}>
      <Stack.Screen name="index" options={{ title: 'PriorProof' }} />
      <Stack.Screen name="create" options={{ title: 'Create case' }} />
      <Stack.Screen name="scan" options={{ title: 'Scan case QR' }} />
      <Stack.Screen name="case/[id]/index" options={{ title: 'Case details' }} />
      <Stack.Screen name="case/[id]/capture" options={{ title: 'Capture documents' }} />
      <Stack.Screen name="case/[id]/tasks" options={{ title: 'Agent tasks' }} />
      <Stack.Screen name="case/[id]/evidence" options={{ title: 'Evidence review' }} />
      <Stack.Screen name="case/[id]/packet" options={{ title: 'Draft packet' }} />
    </Stack.Protected>
  </Stack>;
}

export default function Root() {
  return <QueryClientProvider client={queryClient}><SessionProvider><StatusBar style="dark" /><Navigation /></SessionProvider></QueryClientProvider>;
}
