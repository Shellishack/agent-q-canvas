import { memo, type CSSProperties } from 'react';
import type { NodeProps } from '@xyflow/react';
import type { ProjectFlowNode } from '../types';

export const ProjectNode = memo(function ProjectNode({ data, selected }: NodeProps<ProjectFlowNode>) {
  return (
    <section className={`project-frame ${selected ? 'is-selected' : ''}`} style={{ '--project-color': data.color } as CSSProperties}>
      <div className="project-frame-header project-drag-handle">
        <strong>{data.label}</strong>
        <span>{data.path || 'No folder selected'}</span>
      </div>
      <p>{data.summary}</p>
    </section>
  );
});
