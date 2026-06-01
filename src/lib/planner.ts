import type { AgentNodeData, PlannerSuggestion } from '../types';

const WORK_WORDS = ['build', 'fix', 'add', 'create', 'update', 'refactor', 'test', 'review', 'design'];

export function decomposeCommand(command: string, agents: Array<{ id: string; data: AgentNodeData }>): PlannerSuggestion[] {
  const chunks = splitIntoTasks(command);
  const available = agents
    .filter(({ data }) => data.status === 'idle' || data.status === 'queued')
    .sort((a, b) => a.data.tasks.length - b.data.tasks.length);

  if (available.length === 0) {
    return [];
  }

  return chunks.map((chunk, index) => {
    const agent = available[index % available.length];
    return {
      agentId: agent.id,
      task: {
        title: summarize(chunk),
        detail: chunk,
        source: 'global'
      }
    };
  });
}

function splitIntoTasks(command: string): string[] {
  const normalized = command.trim().replace(/\s+/g, ' ');
  if (!normalized) {
    return [];
  }

  const explicit = normalized
    .split(/\s+(?:and then|then|also|;)\s+/i)
    .map((part) => part.trim())
    .filter(Boolean);

  if (explicit.length > 1) {
    return explicit;
  }

  const sentences = normalized.split(/(?<=[.!?])\s+/).filter(Boolean);
  if (sentences.length > 1) {
    return sentences;
  }

  return [normalized];
}

function summarize(text: string) {
  const cleaned = text.replace(/[.!?]+$/, '');
  const words = cleaned.split(' ');
  const startsWithWork = WORK_WORDS.includes(words[0]?.toLowerCase() ?? '');
  const titleWords = startsWithWork ? words.slice(0, 8) : words.slice(0, 7);
  return titleWords.join(' ') + (words.length > titleWords.length ? '...' : '');
}
