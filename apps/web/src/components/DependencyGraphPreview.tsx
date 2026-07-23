import { ReactFlow, Background, Controls, type Edge, type Node } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

const previewNodes: Node[] = [
  { id: 'accounts', position: { x: 0, y: 0 }, data: { label: 'accounts' } },
  { id: 'job', position: { x: 200, y: 0 }, data: { label: 'job' } },
  { id: 'recruiter', position: { x: 100, y: 120 }, data: { label: 'recruiter' } },
];

const previewEdges: Edge[] = [
  { id: 'job-accounts', source: 'job', target: 'accounts' },
  { id: 'recruiter-accounts', source: 'recruiter', target: 'accounts' },
];

/**
 * Phase 3 proof that React Flow (the node-link renderer for the real
 * dependency/architecture graph — see docs/adr/0008) works inside this
 * build pipeline. Real graph data replaces this fixture in Phase 10.
 */
export function DependencyGraphPreview() {
  return (
    <div className="h-64 w-full rounded-lg border">
      <ReactFlow nodes={previewNodes} edges={previewEdges} fitView>
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}
