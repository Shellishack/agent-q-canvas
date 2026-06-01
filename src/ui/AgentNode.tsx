import { memo, useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Check, CircleAlert, CirclePause, CirclePlay, Mic, SendHorizontal, Settings2, Square } from 'lucide-react';
import type { AgentFlowNode, AgentStatus, TaskStatus } from '../types';
import { useAgentActions } from './agent-actions';

const statusLabel: Record<AgentStatus, string> = {
  idle: 'Idle',
  queued: 'Queued',
  running: 'Running',
  'needs-input': 'Needs input',
  blocked: 'Blocked',
  done: 'Done',
  offline: 'Offline'
};

export const AgentNode = memo(function AgentNode({ id, data, selected }: NodeProps<AgentFlowNode>) {
  const [draftTask, setDraftTask] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const actions = useAgentActions();
  const openTasks = data.tasks.filter((task) => task.status !== 'done');
  const activeTask = data.tasks.find((task) => task.id === data.activeTaskId);

  const sendDirect = () => {
    actions.sendDirectTask(id, draftTask, 'direct');
    setDraftTask('');
  };

  const startVoice = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[0]?.[0]?.transcript ?? '';
      actions.sendDirectTask(id, transcript, 'voice');
    };
    recognition.start();
  };

  return (
    <article className={`agent-node ${selected ? 'is-selected' : ''} status-${data.status}`}>
      <Handle type="target" position={Position.Left} />
      <header>
        <div>
          <input
            value={data.label}
            onChange={(event) => actions.updateAgent(id, { label: event.target.value })}
            aria-label="Agent name"
          />
          <span>{data.kind} · {statusLabel[data.status]}</span>
        </div>
        <button type="button" onClick={() => setSettingsOpen((value) => !value)} title="Agent settings">
          <Settings2 size={16} />
        </button>
      </header>

      {settingsOpen ? (
        <div className="agent-settings">
          <label>
            Command
            <input value={data.command} onChange={(event) => actions.updateAgent(id, { command: event.target.value })} />
          </label>
          <label>
            Working directory
            <input value={data.cwd} onChange={(event) => actions.updateAgent(id, { cwd: event.target.value })} placeholder="Home folder" />
          </label>
        </div>
      ) : null}

      <section className="agent-summary">
        <p>{activeTask?.title ?? data.summary}</p>
        <div className="queue-meter">
          <span>{openTasks.length}</span>
          tasks queued
        </div>
      </section>

      <section className="task-list">
        {data.tasks.slice(-5).map((task) => (
          <div key={task.id} className={`task-row task-${task.status}`}>
            {iconForTask(task.status)}
            <span>{task.title}</span>
            <select value={task.status} onChange={(event) => actions.setTaskStatus(id, task.id, event.target.value as TaskStatus)}>
              <option value="pending">Pending</option>
              <option value="running">Running</option>
              <option value="needs-input">Needs input</option>
              <option value="blocked">Blocked</option>
              <option value="done">Done</option>
            </select>
          </div>
        ))}
        {data.tasks.length === 0 ? <p className="empty-queue">No queued work.</p> : null}
      </section>

      <footer>
        <input
          value={draftTask}
          onChange={(event) => setDraftTask(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              sendDirect();
            }
          }}
          placeholder="Direct task"
        />
        <button type="button" onClick={startVoice} title="Voice task">
          <Mic size={15} />
        </button>
        <button type="button" onClick={sendDirect} title="Queue direct task">
          <SendHorizontal size={15} />
        </button>
        <button type="button" onClick={() => actions.runNextTask(id)} title="Run next task">
          <CirclePlay size={15} />
        </button>
      </footer>
      <Handle type="source" position={Position.Right} />
    </article>
  );
});

function iconForTask(status: TaskStatus) {
  switch (status) {
    case 'running':
      return <CirclePlay size={14} />;
    case 'needs-input':
      return <CirclePause size={14} />;
    case 'blocked':
      return <CircleAlert size={14} />;
    case 'done':
      return <Check size={14} />;
    default:
      return <Square size={14} />;
  }
}
