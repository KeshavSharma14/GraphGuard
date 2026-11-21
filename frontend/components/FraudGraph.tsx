"use client";

import dynamic from "next/dynamic";
import { useMemo, useRef } from "react";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false });

export type GraphNode = {
  id: string;
  label: string;
  riskScore: number;
  flagged: boolean;
  fraudRingId: string | null;
  reasons: string[];
  metadata: Record<string, unknown>;
  x?: number;
  y?: number;
};

export type GraphEdge = {
  id: string;
  source: string;
  target: string;
  amount: number;
  timestamp: string;
  device?: string;
  ipAddress?: string;
};

export default function FraudGraph({
  nodes,
  edges,
  ringIds,
  onSelect,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  ringIds: Set<string>;
  onSelect: (node: GraphNode) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const data = useMemo(
    () => ({
      nodes: nodes.map((node) => ({ ...node })),
      links: edges.map((edge) => ({ ...edge })),
    }),
    [nodes, edges],
  );

  const width = container.current?.clientWidth || 900;

  return (
    <div ref={container} className="h-full min-h-[560px] w-full">
      <ForceGraph2D
        width={width}
        height={560}
        graphData={data}
        backgroundColor="#0b1020"
        nodeRelSize={4.5}
        linkWidth={0.35}
        linkColor={() => "rgba(125, 145, 180, 0.18)"}
        nodeCanvasObject={(node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
          const graphNode = node as GraphNode;
          const risk = graphNode.riskScore;
          const ring = graphNode.fraudRingId && ringIds.has(graphNode.fraudRingId);
          ctx.beginPath();
          ctx.arc(node.x || 0, node.y || 0, ring ? 7 : 5.5, 0, 2 * Math.PI);
          ctx.fillStyle = risk >= 65 ? "#fb7185" : risk >= 35 ? "#fbbf24" : "#34d399";
          ctx.fill();
          if (ring) {
            ctx.strokeStyle = "#ef4444";
            ctx.lineWidth = 2 / globalScale;
            ctx.stroke();
          }
          if (graphNode.flagged) {
            ctx.strokeStyle = "#ffffff";
            ctx.lineWidth = 1.5 / globalScale;
            ctx.stroke();
          }
        }}
        nodePointerAreaPaint={(node: any, color: string, ctx: CanvasRenderingContext2D) => {
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(node.x || 0, node.y || 0, 8, 0, 2 * Math.PI);
          ctx.fill();
        }}
        onNodeClick={(node: any) => onSelect(node as GraphNode)}
        nodeLabel={(node: any) => `${(node as GraphNode).label} · ${(node as GraphNode).riskScore}% risk`}
        cooldownTicks={100}
      />
    </div>
  );
}
