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
  type EdgeChange,
  type NodeChange,
  type NodeTypes,
  type OnInit,
  type ReactFlowInstance
} from '@xyflow/react';
import { Bot, ChevronDown, FolderKanban, GitBranch, Mic, Plus, SendHorizontal, Sparkles } from 'lucide-react';
import { nanoid } from 'nanoid';
import { decomposeCommand } from '../lib/planner';
import type {
  AgentCanvas,
  AgentFlowNode,
  AgentKind,
  AgentNodeData,
  AgentStatus,
  AgentTask,
  CanvasNode,
  ProjectFlowNode,
  TaskStatus
} from '../types';
import { AgentNode } from './AgentNode';
import { AgentActionsContext } from './agent-actions';
import { ProjectNode } from './ProjectNode';

const nodeTypes = { agent: AgentNode, project: ProjectNode } satisfies NodeTypes;
const now = () => new Date().toISOString();
const projectColors = ['#72d0a5', '#7dd3fc', '#f5b74a', '#b48cff', '#f36b6b'];

function createAgent(label: string, kind: AgentKind, command: string, summary: string, projectId?: string): AgentNodeData {
  return {
    label,
    kind,
    status: 'idle',
    command,
    cwd: '',
    projectId,
    tasks: [],
    transcript: [],
    summary
  };
}

function createProjectNode(id: string, label: string, position: { x: number; y: number }, color: string): ProjectFlowNode {
  return {
    id,
    type: 'project',
    position,
    width: 760,
    height: 520,
    selectable: true,
    draggable: true,
    data: {
      label,
      path: '',
      color,
      summary: 'Project workspace: agents and task queues inside this dashed region belong together.'
    }
  };
}

const mainProject = createProjectNode('project-agent-q', 'Agent Q Canvas', { x: 40, y: 80 }, projectColors[0]);
const sideProject = createProjectNode('project-sidecar', 'Sidecar Prototype', { x: 900, y: 120 }, projectColors[1]);

const initialCanvas: AgentCanvas = {
  id: 'canvas-main',
  name: 'Main canvas',
  nodes: [
    mainProject,
    {
      id: 'agent-codex',
      type: 'agent',
      position: { x: 80, y: 170 },
      data: createAgent('Codex planner', 'codex', 'codex', 'Triage architecture and implementation tasks', mainProject.id)
    },
    {
      id: 'agent-opencode',
      type: 'agent',
      position: { x: 470, y: 210 },
      data: createAgent('OpenCode builder', 'opencode', 'opencode', 'Ready for implementation work', mainProject.id)
    },
    sideProject,
    {
      id: 'sidecar-agent-planner',
      type: 'agent',
      position: { x: 940, y: 210 },
      data: createAgent('Sidecar planner', 'codex', 'codex', 'Break product ideas into implementation tasks', sideProject.id)
    },
    {
      id: 'sidecar-agent-builder',
      type: 'agent',
      position: { x: 1330, y: 250 },
      data: createAgent('Sidecar builder', 'opencode', 'opencode', 'Implement queued work for this project', sideProject.id)
    }
  ],
  edges: [
    { id: 'edge-codex-opencode', source: 'agent-codex', target: 'agent-opencode', animated: true },
    { id: 'edge-sidecar-plan-build', source: 'sidecar-agent-planner', target: 'sidecar-agent-builder', animated: true }
  ]
};

const secondCanvas: AgentCanvas = {
  id: 'canvas-research',
  name: 'Research canvas',
  nodes: [createProjectNode('project-research', 'Research Inbox', { x: 120, y: 120 }, projectColors[2])],
  edges: []
};

export function App() {
  const [canvases, setCanvases] = useState<AgentCanvas[]>([initialCanvas, secondCanvas]);
  const [activeCanvasId, setActiveCanvasId] = useState(initialCanvas.id);
  const [globalCommand, setGlobalCommand] = useState('');
  const [selectedAgentId, setSelectedAgentId] = useState<string>('auto');
  const [commandScope, setCommandScope] = useState<'canvas' | 'project'>('canvas');
  const [navigatorOpen, setNavigatorOpen] = useState(false);
  const [notice, setNotice] = useState('Right-click the canvas to create a project group.');
  const [flow, setFlow] = useState<ReactFlowInstance<CanvasNode, any> | null>(null);

  const activeCanvas = canvases.find((canvas) => canvas.id === activeCanvasId) ?? canvases[0];
  const nodes = activeCanvas.nodes;
  const edges = activeCanvas.edges;
  const agents = nodes.filter((node): node is AgentFlowNode => node.type === 'agent');
  const projects = nodes.filter((node): node is ProjectFlowNode => node.type === 'project');
  const selectedProjectId = selectedAgentId === 'auto' ? projects[0]?.id : agents.find((agent) => agent.id === selectedAgentId)?.data.projectId;

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

  const agentOptions = useMemo(() => agents.map((node) => ({ id: node.id, label: node.data.label })), [agents]);
  const totalOpenTasks = agents.reduce((sum, node) => sum + node.data.tasks.filter((task) => task.status !== 'done').length, 0);
  const totalAttention = agents.filter((node) => node.data.status === 'needs-input' || node.data.status === 'blocked').length;

  const updateActiveCanvas = (updater: (canvas: AgentCanvas) => AgentCanvas) => {
    setCanvases((current) => current.map((canvas) => (canvas.id === activeCanvasId ? updater(canvas) : canvas)));
  };

  const onNodesChange = useCallback(
    (changes: NodeChange<CanvasNode>[]) => {
      updateActiveCanvas((canvas) => ({ ...canvas, nodes: applyNodeChanges<CanvasNode>(changes, canvas.nodes) }));
    },
    [activeCanvasId]
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      updateActiveCanvas((canvas) => ({ ...canvas, edges: applyEdgeChanges(changes, canvas.edges) }));
    },
    [activeCanvasId]
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      updateActiveCanvas((canvas) => ({ ...canvas, edges: addEdge({ ...connection, animated: true }, canvas.edges) }));
    },
    [activeCanvasId]
  );

  const addCanvas = () => {
    const id = `canvas-${nanoid(6)}`;
    const canvas: AgentCanvas = {
      id,
      name: `Canvas ${canvases.length + 1}`,
      nodes: [createProjectNode(`project-${nanoid(6)}`, 'New Project', { x: 120, y: 120 }, projectColors[canvases.length % projectColors.length])],
      edges: []
    };
    setCanvases((current) => [...current, canvas]);
    setActiveCanvasId(id);
    setSelectedAgentId('auto');
  };

  const createProjectAt = (position: { x: number; y: number }) => {
    const id = `project-${nanoid(6)}`;
    const projectIndex = projects.length + 1;
    const projectNode = createProjectNode(id, `Project ${projectIndex}`, position, projectColors[projects.length % projectColors.length]);
    const plannerId = `${id}-planner`;
    const builderId = `${id}-builder`;

    updateActiveCanvas((canvas) => ({
      ...canvas,
      nodes: [
        ...canvas.nodes,
        projectNode,
        {
          id: plannerId,
          type: 'agent',
          position: { x: position.x + 40, y: position.y + 90 },
          data: createAgent('Planner', 'codex', 'codex', 'Ready to plan work for this project', id)
        },
        {
          id: builderId,
          type: 'agent',
          position: { x: position.x + 430, y: position.y + 130 },
          data: createAgent('Builder', 'opencode', 'opencode', 'Ready to implement queued work', id)
        }
      ],
      edges: [...canvas.edges, { id: `${id}-plan-build`, source: plannerId, target: builderId, animated: true }]
    }));
    setNotice(`Created ${projectNode.data.label}.`);
  };

  const addAgent = () => {
    const projectId = selectedProjectId ?? projects[0]?.id;
    const project = projects.find((candidate) => candidate.id === projectId);
    const id = `${projectId ?? activeCanvasId}-agent-${nanoid(6)}`;
    const position = project ? { x: project.position.x + 80, y: project.position.y + 250 } : { x: 180, y: 240 };

    updateActiveCanvas((canvas) => ({
      ...canvas,
      nodes: [
        ...canvas.nodes,
        {
          id,
          type: 'agent',
          position,
          data: createAgent('Agent', 'custom', 'pwsh', 'Idle local agent, ready for a task.', projectId)
        }
      ]
    }));
    setSelectedAgentId(id);
  };

  const assignGlobalCommand = (source: AgentTask['source'] = 'global') => {
    const command = globalCommand.trim();
    if (!command) return;

    const targetAgents =
      commandScope === 'project' && selectedProjectId
        ? agents.filter((agent) => agent.data.projectId === selectedProjectId)
        : agents;
    const suggestions =
      selectedAgentId === 'auto'
        ? decomposeCommand(command, targetAgents.map((agent) => ({ id: agent.id, data: agent.data })))
        : [{ agentId: selectedAgentId, task: { title: command.slice(0, 72), detail: command, source } }];

    if (suggestions.length === 0) {
      setNotice('No idle or queued agents are available in the selected scope.');
      return;
    }

    updateActiveCanvas((canvas) => ({
      ...canvas,
      nodes: canvas.nodes.map((node) => {
        if (node.type !== 'agent') return node;
        const assigned = suggestions.filter((suggestion) => suggestion.agentId === node.id);
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
    }));

    setNotice(`Assigned ${suggestions.length} task${suggestions.length === 1 ? '' : 's'} on ${activeCanvas.name}.`);
    setGlobalCommand('');
  };

  const startVoice = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setNotice('Voice command is not available in this browser runtime.');
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      setGlobalCommand(event.results[0]?.[0]?.transcript ?? '');
      setNotice('Voice command captured. Review it, then send.');
    };
    recognition.start();
  };

  const runNextTask = async (agentId: string) => {
    const node = agents.find((candidate) => candidate.id === agentId);
    const task = node?.data.tasks.find((candidate) => candidate.status === 'pending');
    if (!node || !task) return;

    setTaskStatus(agentId, task.id, 'running');
    setNodeStatus(agentId, 'running');

    const started = await window.agentQ?.agent.start({ id: agentId, command: node.data.command, cwd: node.data.cwd || undefined });
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

  const updateAgentNode = (agentId: string, updater: (node: AgentFlowNode) => AgentFlowNode) => {
    setCanvases((current) =>
      current.map((canvas) => ({
        ...canvas,
        nodes: canvas.nodes.map((node) => (node.type === 'agent' && node.id === agentId ? updater(node) : node))
      }))
    );
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

  const setNodeStatus = (agentId: string, status: AgentStatus) => {
    updateAgentNode(agentId, (node) => ({ ...node, data: { ...node.data, status } }));
  };

  const sendDirectTask = (agentId: string, detail: string, source: AgentTask['source']) => {
    const text = detail.trim();
    if (!text) return;
    updateAgentNode(agentId, (node) => ({
      ...node,
      data: {
        ...node.data,
        status: node.data.status === 'idle' ? 'queued' : node.data.status,
        tasks: [...node.data.tasks, { id: nanoid(), title: text.slice(0, 72), detail: text, source, status: 'pending', createdAt: now() }]
      }
    }));
  };

  const updateAgent = (agentId: string, patch: Partial<AgentNodeData>) => {
    updateAgentNode(agentId, (node) => ({ ...node, data: { ...node.data, ...patch } }));
  };

  const focusProject = (project: ProjectFlowNode) => {
    setNavigatorOpen(false);
    setTimeout(() => {
      flow?.setCenter(project.position.x + 380, project.position.y + 260, { zoom: 0.85, duration: 500 });
    }, 0);
  };

  const onInit: OnInit<CanvasNode, any> = (instance) => setFlow(instance);

  return (
    <div className="app-shell">
      <aside className="sidebar compact-sidebar">
        <div className="brand">
          <Bot size={28} />
          <div>
            <h1>Agent Q Canvas</h1>
            <p>Canvases, project groups, local agent queues.</p>
          </div>
        </div>

        <section className="panel">
          <div className="panel-title">
            <Sparkles size={16} />
            Command
          </div>
          <textarea
            value={globalCommand}
            onChange={(event) => setGlobalCommand(event.target.value)}
            placeholder="Describe a goal for the canvas or selected project."
          />
          <div className="scope-row">
            <button type="button" className={commandScope === 'canvas' ? 'is-active' : ''} onClick={() => setCommandScope('canvas')}>
              Canvas
            </button>
            <button type="button" className={commandScope === 'project' ? 'is-active' : ''} onClick={() => setCommandScope('project')}>
              Project
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

        <section className="panel slim-panel">
          <button type="button" className="navigator-toggle" onClick={() => setNavigatorOpen((open) => !open)}>
            <FolderKanban size={16} />
            <span>{activeCanvas.name}</span>
            <ChevronDown size={15} />
          </button>
          {navigatorOpen ? (
            <div className="navigator-popover">
              <div className="canvas-list">
                {canvases.map((canvas) => (
                  <button
                    key={canvas.id}
                    type="button"
                    className={canvas.id === activeCanvasId ? 'is-active' : ''}
                    onClick={() => {
                      setActiveCanvasId(canvas.id);
                      setSelectedAgentId('auto');
                    }}
                  >
                    {canvas.name}
                  </button>
                ))}
                <button type="button" onClick={addCanvas}>
                  <Plus size={14} />
                  New canvas
                </button>
              </div>
              <div className="project-list collapsed-list">
                {projects.map((project) => (
                  <button key={project.id} type="button" className="project-button" onClick={() => focusProject(project)}>
                    <span className="project-color" style={{ background: project.data.color }} />
                    <span>
                      <strong>{project.data.label}</strong>
                      <small>Jump to project group</small>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </section>

        <section className="panel compact">
          <div className="metric">
            <span>{projects.length}</span>
            projects
          </div>
          <div className="metric">
            <span>{totalOpenTasks}</span>
            open
          </div>
          <div className="metric">
            <span>{totalAttention}</span>
            attention
          </div>
        </section>

        <button type="button" className="secondary-button" onClick={addAgent}>
          <Plus size={17} />
          Add agent to project
        </button>
      </aside>

      <main className="workspace">
        <div className="topbar">
          <div>
            <strong>{activeCanvas.name}</strong>
            <span>{notice}</span>
          </div>
          <div className="topbar-pill">
            <GitBranch size={15} />
            right-click creates projects
          </div>
        </div>
        <AgentActionsContext.Provider value={{ runNextTask, sendDirectTask, updateAgent, setTaskStatus }}>
          <ReactFlow
            key={activeCanvas.id}
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onInit={onInit}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onPaneContextMenu={(event) => {
              event.preventDefault();
              if (!flow) return;
              createProjectAt(flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }));
            }}
            fitView
            minZoom={0.2}
            maxZoom={1.4}
          >
            <Background gap={24} color="#2b3138" />
            <MiniMap pannable zoomable nodeColor={(node) => (node.type === 'project' ? (node.data as any).color : statusColor((node.data as AgentNodeData).status))} />
            <Controls />
          </ReactFlow>
        </AgentActionsContext.Provider>
      </main>
    </div>
  );
}

function inferStatus(text: string, fallback: AgentStatus): AgentStatus {
  const lower = text.toLowerCase();
  if (lower.includes('?') || lower.includes('approve') || lower.includes('permission')) return 'needs-input';
  if (lower.includes('error') || lower.includes('failed')) return 'blocked';
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
