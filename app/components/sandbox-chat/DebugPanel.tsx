import type { SessionSnapshot } from "@/app/components/sandbox-chat/types";

export function DebugPanel({ from, session }: { from: string | null; session: SessionSnapshot | null }) {
  return (
    <div className="hidden overflow-y-auto border-l border-gray-200 bg-gray-50 p-3 text-xs lg:block">
      <h3 className="mb-2 font-semibold text-gray-700">Debug</h3>
      <div className="mb-2">
        <span className="font-medium text-gray-800">from:</span>{" "}
        <span className="text-gray-600">{from ?? "…"}</span>
      </div>
      <div className="mb-2">
        <span className="font-medium text-gray-800">state:</span>{" "}
        <span className="text-gray-600">{session?.state ?? "—"}</span>
      </div>
      <div className="mb-2">
        <div className="font-medium text-gray-800">slots</div>
        <pre className="whitespace-pre-wrap break-all rounded bg-white p-2 text-[10px] text-gray-600">
          {JSON.stringify(session?.slots ?? {}, null, 2)}
        </pre>
      </div>
      <div>
        <div className="font-medium text-gray-800">counters</div>
        <pre className="whitespace-pre-wrap break-all rounded bg-white p-2 text-[10px] text-gray-600">
          {JSON.stringify(session?.counters ?? {}, null, 2)}
        </pre>
      </div>
    </div>
  );
}
