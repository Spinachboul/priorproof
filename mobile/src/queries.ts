import { useQuery } from '@tanstack/react-query';
import { useSession } from './session';
import { casePath, runsPath, type AgentRun, type CaseDetails } from './types';

export function useCase(id: string) {
  const { call } = useSession();
  return useQuery({ queryKey: ['case', id], queryFn: () => call<CaseDetails>(casePath(id)), enabled: !!id, refetchInterval: 4000 });
}

export function useAgent(id: string) {
  const { call } = useSession();
  return useQuery({ queryKey: ['agent', id], queryFn: () => call<AgentRun | null>(runsPath(id) + '/latest'), enabled: !!id, refetchInterval: 4000 });
}
