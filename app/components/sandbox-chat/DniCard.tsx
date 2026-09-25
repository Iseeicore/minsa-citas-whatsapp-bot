import { LockIcon } from "@/app/components/sandbox-chat/icons";

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
    <div className="ml-9 mb-3 max-w-[75%] rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
      <div className="mb-2 flex items-center gap-1.5 text-sm font-medium text-[var(--sb-accent)]">
        <LockIcon className="h-4 w-4" />
        Acceso rápido con Documento
      </div>
      <input
        type="text"
        inputMode="numeric"
        maxLength={8}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onSubmit();
        }}
        placeholder="Ingresa los 8 dígitos de tu DNI"
        className="mb-2 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-[var(--sb-accent)]"
      />
      <button
        onClick={onSubmit}
        disabled={!value.trim()}
        className="w-full rounded-lg bg-[var(--sb-accent)] px-3 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-40"
      >
        Validar y Continuar Cita
      </button>
      <p className="mt-2 text-center text-[11px] text-gray-400">
        ¿No estás registrado?{" "}
        <a href="#" className="text-[var(--sb-accent)] hover:underline">
          Regístrate aquí
        </a>
      </p>
    </div>
  );
}
