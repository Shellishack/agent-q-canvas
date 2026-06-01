import { createContext, useContext } from 'react';
import type { AgentNodeData, AgentTask, TaskStatus } from '../types';

export type AgentActions = {
  runNextTask(agentId: string): void;
  sendDirectTask(agentId: string, detail: string, source: AgentTask['source']): void;
  updateAgent(agentId: string, patch: Partial<AgentNodeData>): void;
  setTaskStatus(agentId: string, taskId: string, status: TaskStatus): void;
};

export const AgentActionsContext = createContext<AgentActions | null>(null);

export function useAgentActions() {
  const actions = useContext(AgentActionsContext);
  if (!actions) {
    throw new Error('Agent actions context is missing.');
  }
  return actions;
}
