import { useRef, useEffect } from "react";
import mermaid from "mermaid";

mermaid.initialize({ startOnLoad: false, theme: "default" });

export function MermaidChart({ chart }: { chart: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current || !chart.trim()) return;
    let cancelled = false;
    const run = async () => {
      try {
        const id = `mermaid-${Math.random().toString(36).slice(2, 9)}`;
        const { svg } = await mermaid.render(id, chart);
        if (!cancelled && ref.current) {
          ref.current.innerHTML = "";
          const container = document.createElement("div");
          container.innerHTML = svg;
          while (container.firstChild) {
            ref.current.appendChild(container.firstChild);
          }
        }
      } catch {
        if (!cancelled && ref.current) {
          ref.current.innerHTML = "";
          const pre = document.createElement("pre");
          pre.className =
            "text-xs text-danger p-3 rounded-md bg-surface-muted border border-border-subtle";
          pre.textContent = chart;
          ref.current.appendChild(pre);
        }
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [chart]);

  return <div ref={ref} className="flex justify-center py-2" />;
}
