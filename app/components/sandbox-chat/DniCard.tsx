import { LockIcon } from "@/app/components/icons";

export function DniCard({
  value,
  onChange,
  onSubmit,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="ml-9 mb-3 max-w-3/4 rounded-2xl border border-sb-bubble-border bg-white p-3 shadow-sm">
      <div className="mb-2 flex items-center gap-1.5 text-sm font-medium text-sb-accent">
        <LockIcon className="h-4 w-4" />
        Acceso rápido con Documento
      </div>
      <input
        type="text"
        inputMode="numeric"
        maxLength={9}
        aria-label="Número de documento"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onSubmit();
        }}
        placeholder="Ingresa tu número de documento"
        className="mb-2 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-sb-accent"
      />
      <button
        onClick={onSubmit}
        disabled={!value.trim()}
        className="w-full rounded-lg bg-sb-accent px-3 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-40"
      >
        Validar y Continuar Cita
      </button>
    </div>
  );
}
