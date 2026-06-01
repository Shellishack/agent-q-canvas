export type AgentKind = 'codex' | 'claude' | 'opencode' | 'gemini' | 'copilot' | 'custom';

export type AgentStatus = 'idle' | 'queued' | 'running' | 'needs-input' | 'blocked' | 'done' | 'offline';

export type TaskStatus = 'pending' | 'running' | 'needs-input' | 'blocked' | 'done';

export type AgentTask = {
  id: string;
  title: string;
  detail: string;
  status: TaskStatus;
  createdAt: string;
  source: 'global' | 'direct' | 'voice';
};

export type AgentNodeData = {
  label: string;
  kind: AgentKind;
  status: AgentStatus;
  command: string;
  cwd: string;
  projectId?: string;
  activeTaskId?: string;
  tasks: AgentTask[];
  transcript: string[];
  summary: string;
};

export type AgentFlowNode = import('@xyflow/react').Node<AgentNodeData, 'agent'>;

export type ProjectNodeData = {
  label: string;
  path: string;
  color: string;
  summary: string;
};

export type ProjectFlowNode = import('@xyflow/react').Node<ProjectNodeData, 'project'>;

export type CanvasNode = AgentFlowNode | ProjectFlowNode;

export type ProjectWorkspace = {
  id: string;
  name: string;
  path: string;
  color: string;
  summary: string;
  nodes: AgentFlowNode[];
  edges: import('@xyflow/react').Edge[];
};

export type AgentCanvas = {
  id: string;
  name: string;
  nodes: CanvasNode[];
  edges: import('@xyflow/react').Edge[];
};

export type PlannerSuggestion = {
  agentId: string;
  task: Omit<AgentTask, 'id' | 'createdAt' | 'status'>;
};

export type AgentQApi = {
  agent: {
    start(input: { id: string; command: string; args?: string[]; cwd?: string }): Promise<{ ok: boolean; error?: string }>;
    send(input: { id: string; text: string }): Promise<{ ok: boolean; error?: string }>;
    stop(input: { id: string }): Promise<{ ok: boolean; error?: string }>;
    listRuntimes(): Promise<Array<{ id: string; command: string; args: string[]; cwd: string }>>;
    onOutput(callback: (event: { id: string; stream: 'stdout' | 'stderr'; text: string }) => void): () => void;
    onExit(callback: (event: { id: string; code: number | null }) => void): () => void;
  };
};

declare global {
  type SpeechRecognitionEvent = Event & {
    results: ArrayLike<ArrayLike<{ transcript: string }>>;
  };

  type SpeechRecognition = {
    lang: string;
    interimResults?: boolean;
    onresult: ((event: SpeechRecognitionEvent) => void) | null;
    start(): void;
  };

  interface Window {
    agentQ?: AgentQApi;
    SpeechRecognition?: new () => SpeechRecognition;
    webkitSpeechRecognition?: new () => SpeechRecognition;
  }
}
