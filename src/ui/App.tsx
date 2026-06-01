import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type NodeTypes,
  type NodeChange,
  type EdgeChange
} from '@xyflow/react';
import { Bot, GitBranch, Mic, Plus, SendHorizontal, Sparkles, TerminalSquare } from 'lucide-react';
import { nanoid } from 'nanoid';
import { decomposeCommand } from '../lib/planner';
import type { AgentFlowNode, AgentKind, AgentNodeData, AgentStatus, AgentTask, TaskStatus } from '../types';
import { AgentNode } from './AgentNode';
import { AgentActionsContext } from './agent-actions';

const nodeTypes = { agent: AgentNode } satisfies NodeTypes;

const now = () => new Date().toISOString();

const initialNodes: AgentFlowNode[] = [
  {
    id: 'agent-codex',
    type: 'agent',
    position: { x: 60, y: 80 },
    data: createAgent('Codex planner', 'codex', 'codex', 'Triage architecture and implementation tasks')
  },
  {
    id: 'agent-opencode',
    type: 'agent',
    position: { x: 480, y: 130 },
    data: createAgent('OpenCode builder', 'opencode', 'opencode', 'Ready for implementation work')
  },
  {
    id: 'agent-qa',
    type: 'agent',
    position: { x: 900, y: 90 },
    data: createAgent('Review runner', 'custom', 'pwsh', 'Runs checks, reviews output, and flags blockers')
  }
];

const initialEdges: Edge[] = [
  { id: 'edge-codex-opencode', source: 'agent-codex', target: 'agent-opencode', animated: true },
  { id: 'edge-opencode-qa', source: 'agent-opencode', target: 'agent-qa', animated: true }
];

function createAgent(label: string, kind: AgentKind, command: string, summary: string): AgentNodeData {
  return {
    label,
    kind,
    status: 'idle',
    command,
    cwd: '',
    tasks: [],
    transcript: [],
    summary
  };
}

export function App() {
  const [nodes, setNodes] = useState<AgentFlowNode[]>(initialNodes);
  const [edges, setEdges] = useState<Edge[]>(initialEdges);
  const [globalCommand, setGlobalCommand] = useState('');
  const [selectedAgentId, setSelectedAgentId] = useState<string>('auto');
  const [notice, setNotice] = useState('Reference survey loaded: ReactFlow canvas, local terminal sessions, task queues, worktree isolation, command center.');

  useEffect(() => {
    const unsubscribeOutput = window.agentQ?.agent.onOutput((event) => {
      setNodes((current) =>
        current.map((node) =>
          node.id === event.id
            ? {
                ...node,
                data: {
                  ...node.data,
                  status: inferStatus(event.text, node.data.status),
                  transcript: [...node.data.transcript.slice(-80), event.text],
                  summary: event.text.trim().slice(0, 160) || node.data.summary
                }
              }
            : node
        )
      );
    });

    const unsubscribeExit = window.agentQ?.agent.onExit((event) => {
      setNodes((current) =>
        current.map((node) =>
          node.id === event.id
            ? {
                ...node,
                data: {
                  ...node.data,
                  status: event.code === 0 ? 'done' : 'blocked',
                  summary: event.code === 0 ? 'Process exited cleanly.' : `Process exited with code ${event.code ?? 'unknown'}.`
                }
              }
            : node
        )
      );
    });

    return () => {
      unsubscribeOutput?.();
      unsubscribeExit?.();
    };
  }, []);

  const agentOptions = useMemo(() => nodes.map((node) => ({ id: node.id, label: node.data.label })), [nodes]);

  const onNodesChange = useCallback(
    (changes: NodeChange<AgentFlowNode>[]) => setNodes((nds) => applyNodeChanges<AgentFlowNode>(changes, nds)),
    []
  );
  const onEdgesChange = useCallback((changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds)), []);
  const onConnect = useCallback((connection: Connection) => setEdges((eds) => addEdge({ ...connection, animated: true }, eds)), []);

  const addAgent = () => {
    const id = `agent-${nanoid(6)}`;
    setNodes((current) => [
      ...current,
      {
        id,
        type: 'agent',
        position: { x: 140 + current.length * 70, y: 260 + current.length * 35 },
        data: createAgent(`Agent ${current.length + 1}`, 'custom', 'pwsh', 'Idle local agent, ready for a task.')
      }
    ]);
    setSelectedAgentId(id);
  };

  const assignGlobalCommand = (source: AgentTask['source'] = 'global') => {
    const command = globalCommand.trim();
    if (!command) {
      return;
    }

    const agentRecords = nodes.map((node) => ({ id: node.id, data: node.data }));
    const suggestions =
      selectedAgentId === 'auto'
        ? decomposeCommand(command, agentRecords)
        : [
            {
              agentId: selectedAgentId,
              task: { title: command.slice(0, 72), detail: command, source }
            }
          ];

    if (suggestions.length === 0) {
      setNotice('No idle or queued agents are available. Add an agent or clear a queue first.');
      return;
    }

    setNodes((current) =>
      current.map((node) => {
        const assigned = suggestions.filter((suggestion) => suggestion.agentId === node.id);
        if (assigned.length === 0) {
          return node;
        }

        const tasks = assigned.map<AgentTask>((suggestion) => ({
          id: nanoid(),
          title: suggestion.task.title,
          detail: suggestion.task.detail,
          source: suggestion.task.source,
          status: 'pending',
          createdAt: now()
        }));

        return {
          ...node,
          data: {
            ...node.data,
            status: node.data.status === 'idle' ? 'queued' : node.data.status,
            tasks: [...node.data.tasks, ...tasks],
            summary: `${tasks.length} task${tasks.length === 1 ? '' : 's'} queued.`
          }
        };
      })
    );

    setNotice(`Assigned ${suggestions.length} task${suggestions.length === 1 ? '' : 's'} from the global command.`);
    setGlobalCommand('');
  };

  const startVoice = () => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setNotice('Voice command is not available in this browser runtime.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[0]?.[0]?.transcript ?? '';
      setGlobalCommand(transcript);
      setNotice('Voice command captured. Review it, then send.');
    };
    recognition.start();
  };

  const runNextTask = async (agentId: string) => {
    const node = nodes.find((candidate) => candidate.id === agentId);
    const task = node?.data.tasks.find((candidate) => candidate.status === 'pending');
    if (!node || !task) {
      return;
    }

    setTaskStatus(agentId, task.id, 'running');
    setNodeStatus(agentId, 'running');

    const started = await window.agentQ?.agent.start({
      id: agentId,
      command: node.data.command,
      cwd: node.data.cwd || undefined
    });

    if (started && !started.ok && !started.error?.includes('already running')) {
      setNotice(started.error ?? 'Failed to start local agent process.');
      setTaskStatus(agentId, task.id, 'blocked');
      setNodeStatus(agentId, 'blocked');
      return;
    }

    const sent = await window.agentQ?.agent.send({ id: agentId, text: task.detail });
    if (sent && !sent.ok) {
      setNotice(sent.error ?? 'Failed to send task to local agent.');
      setTaskStatus(agentId, task.id, 'blocked');
      setNodeStatus(agentId, 'blocked');
      return;
    }

    setNotice(`Sent "${task.title}" to ${node.data.label}.`);
  };

  const setTaskStatus = (agentId: string, taskId: string, status: TaskStatus) => {
    setNodes((current) =>
      current.map((node) =>
        node.id === agentId
          ? {
              ...node,
              data: {
                ...node.data,
                activeTaskId: status === 'running' ? taskId : node.data.activeTaskId,
                tasks: node.data.tasks.map((task) => (task.id === taskId ? { ...task, status } : task))
              }
            }
          : node
      )
    );
  };

  const setNodeStatus = (agentId: string, status: AgentStatus) => {
    setNodes((current) => current.map((node) => (node.id === agentId ? { ...node, data: { ...node.data, status } } : node)));
  };

  const sendDirectTask = (agentId: string, detail: string, source: AgentTask['source']) => {
    const text = detail.trim();
    if (!text) {
      return;
    }

    setNodes((current) =>
      current.map((node) =>
        node.id === agentId
          ? {
              ...node,
              data: {
                ...node.data,
                status: node.data.status === 'idle' ? 'queued' : node.data.status,
                tasks: [
                  ...node.data.tasks,
                  {
                    id: nanoid(),
                    title: text.slice(0, 72),
                    detail: text,
                    source,
                    status: 'pending',
                    createdAt: now()
                  }
                ]
              }
            }
          : node
      )
    );
  };

  const updateAgent = (agentId: string, patch: Partial<AgentNodeData>) => {
    setNodes((current) => current.map((node) => (node.id === agentId ? { ...node, data: { ...node.data, ...patch } } : node)));
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <Bot size={28} />
          <div>
            <h1>Agent Q Canvas</h1>
            <p>Local coding agents, queues, and human control.</p>
          </div>
        </div>

        <section className="panel">
          <div className="panel-title">
            <Sparkles size={16} />
            Global command
          </div>
          <textarea
            value={globalCommand}
            onChange={(event) => setGlobalCommand(event.target.value)}
            placeholder="Describe a high-level goal, or assign a direct task to a selected agent."
          />
          <div className="command-row">
            <select value={selectedAgentId} onChange={(event) => setSelectedAgentId(event.target.value)}>
              <option value="auto">Auto assign</option>
              {agentOptions.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.label}
                </option>
              ))}
            </select>
            <button type="button" className="icon-button" onClick={startVoice} title="Voice command">
              <Mic size={17} />
            </button>
            <button type="button" className="primary-button" onClick={() => assignGlobalCommand('global')}>
              <SendHorizontal size={17} />
              Send
            </button>
          </div>
        </section>

        <section className="panel compact">
          <div className="metric">
            <span>{nodes.length}</span>
            agents
          </div>
          <div className="metric">
            <span>{nodes.reduce((sum, node) => sum + node.data.tasks.filter((task) => task.status !== 'done').length, 0)}</span>
            open tasks
          </div>
          <div className="metric">
            <span>{nodes.filter((node) => node.data.status === 'needs-input' || node.data.status === 'blocked').length}</span>
            need attention
          </div>
        </section>

        <section className="panel">
          <div className="panel-title">
            <TerminalSquare size={16} />
            Reference-backed choices
          </div>
          <ul className="findings">
            <li>ReactFlow canvas with minimap, fit, pan, zoom, and node links.</li>
            <li>Agent nodes keep local queue, status, summary, and transcript tail.</li>
            <li>IPC boundary is ready for Codex, OpenCode, Claude, or custom CLIs.</li>
            <li>Worktree and approval center are modeled as next architecture steps.</li>
          </ul>
        </section>

        <button type="button" className="secondary-button" onClick={addAgent}>
          <Plus size={17} />
          Add agent
        </button>
      </aside>

      <main className="workspace">
        <div className="topbar">
          <div>
            <strong>Collaboration map</strong>
            <span>{notice}</span>
          </div>
          <div className="topbar-pill">
            <GitBranch size={15} />
            worktree isolation planned
          </div>
        </div>
        <AgentActionsContext.Provider value={{ runNextTask, sendDirectTask, updateAgent, setTaskStatus }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            fitView
            minZoom={0.25}
            maxZoom={1.4}
          >
            <Background gap={24} color="#2b3138" />
            <MiniMap pannable zoomable nodeColor={(node) => statusColor((node.data as AgentNodeData).status)} />
            <Controls />
          </ReactFlow>
        </AgentActionsContext.Provider>
      </main>
    </div>
  );
}

function inferStatus(text: string, fallback: AgentStatus): AgentStatus {
  const lower = text.toLowerCase();
  if (lower.includes('?') || lower.includes('approve') || lower.includes('permission')) {
    return 'needs-input';
  }
  if (lower.includes('error') || lower.includes('failed')) {
    return 'blocked';
  }
  return fallback === 'queued' ? 'running' : fallback;
}

function statusColor(status: AgentStatus) {
  switch (status) {
    case 'running':
      return '#4f8cff';
    case 'needs-input':
      return '#f5b74a';
    case 'blocked':
      return '#f36b6b';
    case 'done':
      return '#60c48f';
    case 'queued':
      return '#b48cff';
    case 'offline':
      return '#6b7280';
    default:
      return '#7dd3fc';
  }
}
