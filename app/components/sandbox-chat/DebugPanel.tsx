import { Heading } from "@/app/components/ui/Heading";
import { HeadingVariant } from "@/lib/enums/ui/heading-variant";
import type { SandboxSessionView } from "@/lib/types/sandbox-reply.types";

export function DebugPanel({ from, session }: { from: string | null; session: SandboxSessionView | null }) {
  const inlineFields = [
    { label: "from:", value: from ?? "…" },
    { label: "state:", value: session?.state ?? "—" },
  ];
  const jsonFields = [
    { label: "slots", value: session?.slots ?? {} },
    { label: "counters", value: session?.counters ?? {} },
  ];

  return (
    <div className="hidden overflow-y-auto border-l border-gray-200 bg-gray-50 p-3 text-xs lg:block">
      <Heading level={3} variant={HeadingVariant.PANEL} className="mb-2">
        Debug
      </Heading>
      <dl className="flex flex-col gap-2">
        {inlineFields.map(({ label, value }) => (
          <div key={label}>
            <dt className="inline font-medium text-gray-800">{label}</dt> <dd className="inline text-gray-600">{value}</dd>
          </div>
        ))}
        {jsonFields.map(({ label, value }) => (
          <div key={label}>
            <dt className="font-medium text-gray-800">{label}</dt>
            <dd>
              <pre className="whitespace-pre-wrap break-all rounded bg-white p-2 text-xs text-gray-600">{JSON.stringify(value, null, 2)}</pre>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
