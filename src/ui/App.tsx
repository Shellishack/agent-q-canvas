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
import { Bot, FolderKanban, GitBranch, Mic, Plus, SendHorizontal, Sparkles, TerminalSquare } from 'lucide-react';
import { nanoid } from 'nanoid';
import { decomposeCommand } from '../lib/planner';
import type { AgentFlowNode, AgentKind, AgentNodeData, AgentStatus, AgentTask, ProjectWorkspace, TaskStatus } from '../types';
import { AgentNode } from './AgentNode';
import { AgentActionsContext } from './agent-actions';

const nodeTypes = { agent: AgentNode } satisfies NodeTypes;

const now = () => new Date().toISOString();

const projectColors = ['#72d0a5', '#7dd3fc', '#f5b74a', '#b48cff', '#f36b6b'];

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

const initialProjects: ProjectWorkspace[] = [
  {
    id: 'project-agent-q',
    name: 'Agent Q Canvas',
    path: 'C:\\GitHub\\agent-q-canvas',
    color: projectColors[0],
    summary: 'Main Electron product workspace.',
    nodes: initialNodes,
    edges: initialEdges
  },
  {
    id: 'project-sidecar',
    name: 'Sidecar Prototype',
    path: '',
    color: projectColors[1],
    summary: 'Example second project with its own agent queue.',
    nodes: [
      {
        id: 'sidecar-agent-planner',
        type: 'agent',
        position: { x: 120, y: 120 },
        data: createAgent('Sidecar planner', 'codex', 'codex', 'Break product ideas into implementation tasks')
      },
      {
        id: 'sidecar-agent-builder',
        type: 'agent',
        position: { x: 560, y: 170 },
        data: createAgent('Sidecar builder', 'opencode', 'opencode', 'Implement queued work for this project')
      }
    ],
    edges: [{ id: 'edge-sidecar-plan-build', source: 'sidecar-agent-planner', target: 'sidecar-agent-builder', animated: true }]
  }
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
  const [projects, setProjects] = useState<ProjectWorkspace[]>(initialProjects);
  const [activeProjectId, setActiveProjectId] = useState(initialProjects[0].id);
  const [globalCommand, setGlobalCommand] = useState('');
  const [selectedAgentId, setSelectedAgentId] = useState<string>('auto');
  const [commandScope, setCommandScope] = useState<'active' | 'all'>('active');
  const [notice, setNotice] = useState('Reference survey loaded: ReactFlow canvas, local terminal sessions, task queues, worktree isolation, command center.');

  const activeProject = projects.find((project) => project.id === activeProjectId) ?? projects[0];
  const nodes = activeProject.nodes;
  const edges = activeProject.edges;

  useEffect(() => {
    const unsubscribeOutput = window.agentQ?.agent.onOutput((event) => {
      updateAgentNode(event.id, (node) => ({
        ...node,
        data: {
          ...node.data,
          status: inferStatus(event.text, node.data.status),
          transcript: [...node.data.transcript.slice(-80), event.text],
          summary: event.text.trim().slice(0, 160) || node.data.summary
        }
      }));
    });

    const unsubscribeExit = window.agentQ?.agent.onExit((event) => {
      updateAgentNode(event.id, (node) => ({
        ...node,
        data: {
          ...node.data,
          status: event.code === 0 ? 'done' : 'blocked',
          summary: event.code === 0 ? 'Process exited cleanly.' : `Process exited with code ${event.code ?? 'unknown'}.`
        }
      }));
    });

    return () => {
      unsubscribeOutput?.();
      unsubscribeExit?.();
    };
  }, []);

  const agentOptions = useMemo(() => nodes.map((node) => ({ id: node.id, label: node.data.label })), [nodes]);
  const totalOpenTasks = projects.reduce(
    (sum, project) => sum + project.nodes.reduce((nodeSum, node) => nodeSum + node.data.tasks.filter((task) => task.status !== 'done').length, 0),
    0
  );
  const totalAttention = projects.reduce(
    (sum, project) => sum + project.nodes.filter((node) => node.data.status === 'needs-input' || node.data.status === 'blocked').length,
    0
  );

  const onNodesChange = useCallback(
    (changes: NodeChange<AgentFlowNode>[]) => {
      setProjects((current) =>
        current.map((project) =>
          project.id === activeProjectId ? { ...project, nodes: applyNodeChanges<AgentFlowNode>(changes, project.nodes) } : project
        )
      );
    },
    [activeProjectId]
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      setProjects((current) =>
        current.map((project) =>
          project.id === activeProjectId ? { ...project, edges: applyEdgeChanges(changes, project.edges) } : project
        )
      );
    },
    [activeProjectId]
  );
  const onConnect = useCallback(
    (connection: Connection) => {
      setProjects((current) =>
        current.map((project) =>
          project.id === activeProjectId ? { ...project, edges: addEdge({ ...connection, animated: true }, project.edges) } : project
        )
      );
    },
    [activeProjectId]
  );

  const addAgent = () => {
    const id = `${activeProjectId}-agent-${nanoid(6)}`;
    setProjects((current) =>
      current.map((project) =>
        project.id === activeProjectId
          ? {
              ...project,
              nodes: [
                ...project.nodes,
                {
                  id,
                  type: 'agent',
                  position: { x: 140 + project.nodes.length * 70, y: 260 + project.nodes.length * 35 },
                  data: createAgent(`Agent ${project.nodes.length + 1}`, 'custom', 'pwsh', 'Idle local agent, ready for a task.')
                }
              ]
            }
          : project
      )
    );
    setSelectedAgentId(id);
  };

  const addProject = () => {
    const id = `project-${nanoid(6)}`;
    const nextIndex = projects.length + 1;
    const newProject: ProjectWorkspace = {
      id,
      name: `Project ${nextIndex}`,
      path: '',
      color: projectColors[projects.length % projectColors.length],
      summary: 'New product workspace.',
      nodes: [
        {
          id: `${id}-planner`,
          type: 'agent',
          position: { x: 160, y: 140 },
          data: createAgent('Planner', 'codex', 'codex', 'Ready to plan work for this project')
        },
        {
          id: `${id}-builder`,
          type: 'agent',
          position: { x: 580, y: 180 },
          data: createAgent('Builder', 'opencode', 'opencode', 'Ready to implement this project queue')
        }
      ],
      edges: [{ id: `${id}-plan-build`, source: `${id}-planner`, target: `${id}-builder`, animated: true }]
    };

    setProjects((current) => [...current, newProject]);
    setActiveProjectId(id);
    setSelectedAgentId('auto');
  };

  const assignGlobalCommand = (source: AgentTask['source'] = 'global') => {
    const command = globalCommand.trim();
    if (!command) {
      return;
    }

    const targetProjects = commandScope === 'all' ? projects : [activeProject];
    const suggestionsByProject = targetProjects.map((project) => {
      const agentRecords = project.nodes.map((node) => ({ id: node.id, data: node.data }));
      return {
        projectId: project.id,
        suggestions:
          selectedAgentId === 'auto' || commandScope === 'all'
            ? decomposeCommand(command, agentRecords)
            : [
                {
                  agentId: selectedAgentId,
                  task: { title: command.slice(0, 72), detail: command, source }
                }
              ]
      };
    });
    const suggestionCount = suggestionsByProject.reduce((sum, item) => sum + item.suggestions.length, 0);

    if (suggestionCount === 0) {
      setNotice('No idle or queued agents are available. Add an agent or clear a queue first.');
      return;
    }

    setProjects((current) =>
      current.map((project) => {
        const projectSuggestions = suggestionsByProject.find((item) => item.projectId === project.id)?.suggestions ?? [];
        if (projectSuggestions.length === 0) return project;

        return {
          ...project,
          nodes: project.nodes.map((node) => {
            const assigned = projectSuggestions.filter((suggestion) => suggestion.agentId === node.id);
            if (assigned.length === 0) return node;

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
        };
      })
    );

    setNotice(`Assigned ${suggestionCount} task${suggestionCount === 1 ? '' : 's'} across ${targetProjects.length} project${targetProjects.length === 1 ? '' : 's'}.`);
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
    updateAgentNode(agentId, (node) => ({
      ...node,
      data: {
        ...node.data,
        activeTaskId: status === 'running' ? taskId : node.data.activeTaskId,
        tasks: node.data.tasks.map((task) => (task.id === taskId ? { ...task, status } : task))
      }
    }));
  };

  const updateAgentNode = (agentId: string, updater: (node: AgentFlowNode) => AgentFlowNode) => {
    setProjects((current) =>
      current.map((project) => ({
        ...project,
        nodes: project.nodes.map((node) => (node.id === agentId ? updater(node) : node))
      }))
    );
  };

  const setNodeStatus = (agentId: string, status: AgentStatus) => {
    updateAgentNode(agentId, (node) => ({ ...node, data: { ...node.data, status } }));
  };

  const sendDirectTask = (agentId: string, detail: string, source: AgentTask['source']) => {
    const text = detail.trim();
    if (!text) {
      return;
    }

    updateAgentNode(agentId, (node) => ({
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
    }));
  };

  const updateAgent = (agentId: string, patch: Partial<AgentNodeData>) => {
    updateAgentNode(agentId, (node) => ({ ...node, data: { ...node.data, ...patch } }));
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
            <FolderKanban size={16} />
            Projects
          </div>
          <div className="project-list">
            {projects.map((project) => {
              const openTasks = project.nodes.reduce((sum, node) => sum + node.data.tasks.filter((task) => task.status !== 'done').length, 0);
              return (
                <button
                  key={project.id}
                  type="button"
                  className={`project-button ${project.id === activeProjectId ? 'is-active' : ''}`}
                  onClick={() => {
                    setActiveProjectId(project.id);
                    setSelectedAgentId('auto');
                  }}
                >
                  <span className="project-color" style={{ background: project.color }} />
                  <span>
                    <strong>{project.name}</strong>
                    <small>{openTasks} open tasks · {project.nodes.length} agents</small>
                  </span>
                </button>
              );
            })}
          </div>
          <button type="button" className="secondary-button" onClick={addProject}>
            <Plus size={17} />
            Add project
          </button>
        </section>

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
          <div className="scope-row">
            <button type="button" className={commandScope === 'active' ? 'is-active' : ''} onClick={() => setCommandScope('active')}>
              Active project
            </button>
            <button type="button" className={commandScope === 'all' ? 'is-active' : ''} onClick={() => setCommandScope('all')}>
              All projects
            </button>
          </div>
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
            active agents
          </div>
          <div className="metric">
            <span>{totalOpenTasks}</span>
            all open
          </div>
          <div className="metric">
            <span>{totalAttention}</span>
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
            <span>{activeProject.name}: {activeProject.summary} {notice}</span>
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
