import { useQuery } from '@tanstack/react-query';
import { useSession } from './session';
import { casePath, runsPath, type AgentRun, type CaseDetails } from './types';

export function useCase(id: string) {
  const { call } = useSession();
  return useQuery({ queryKey: ['case', id], queryFn: () => call<CaseDetails>(casePath(id)), enabled: !!id, refetchInterval: 4000 });
}

export function useAgent(id: string, mode: 'preauthorization' | 'integrity' = 'preauthorization') {
  const { call } = useSession();
  return useQuery({ queryKey: ['agent', id, mode], queryFn: () => call<AgentRun | null>(runsPath(id) + '/latest?mode=' + mode), enabled: !!id, refetchInterval: 4000 });
}


export function useFinancialSummary(id: string) {
  const { call } = useSession();
  return useQuery({
    queryKey: ['integrity-summary', id], enabled: !!id, refetchInterval: 4000,
    queryFn: () => call<{
      stage: string | null; reviewed: boolean; amounts: Record<string, number>;
      findings: { id: string; category: string; status: string; action: string }[];
    }>(casePath(id) + '/integrity/summary'),
  });
}
