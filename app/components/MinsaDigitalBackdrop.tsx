import type { ReactNode } from "react";

export default function MinsaDigitalBackdrop() {
  return (
    <div aria-hidden="true" className="min-h-dvh w-full bg-white">
      <div className="flex min-h-dvh flex-col lg:flex-row">
        <div className="flex flex-col gap-8 bg-[#EAF3FB] px-6 py-10 sm:px-12 sm:py-14 lg:w-[38%] lg:px-16 lg:py-16">
          <div className="flex items-center gap-3">
            <div className="flex h-8 items-stretch overflow-hidden rounded-sm border border-gray-200 text-[10px] font-bold leading-none">
              <span className="flex w-6 items-center justify-center bg-white text-red-600">🛡</span>
              <span className="flex items-center bg-red-600 px-1.5 text-white">PERÚ</span>
              <span className="flex items-center bg-gray-700 px-1.5 text-white">Ministerio<br />de Salud</span>
            </div>
            <span className="text-gray-300">|</span>
            <span className="text-xl font-extrabold">
              <span className="text-[#1E88E5]">Minsa</span>
              <span className="ml-0.5 text-[#00B894]">Digital</span>
            </span>
          </div>

          <div>
            <p className="text-2xl font-bold whitespace-nowrap text-gray-700 sm:text-3xl">
              Te damos la bienvenida a
            </p>
            <p className="text-2xl font-bold text-[#1E88E5] sm:text-3xl">Minsa Digital</p>
          </div>

          <div>
            <p className="mb-2 font-bold text-gray-800">Desde aquí podrás:</p>
            <ul className="space-y-1.5 text-sm text-gray-600">
              {[
                "Ver tu Carné de Vacunación",
                "Reservar tus citas médicas",
                "Consultar el estado de tus referencias médicas",
                "Revisar tus recetas médicas",
                "Ver tu historial citas, entre otros",
              ].map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="text-gray-400">•</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="flex max-w-md items-center gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-sm font-semibold text-gray-700">
              Verificar la validez
              <br />
              de un código QR
            </p>
            <div className="flex flex-shrink-0 flex-col items-center gap-1 rounded-lg bg-[#1E88E5] px-4 py-2.5 text-white">
              <QrIcon className="h-6 w-6" />
              <span className="text-[10px] font-bold">LECTOR QR</span>
            </div>
          </div>
        </div>

        <div className="flex flex-1 items-start justify-center px-6 py-10 sm:px-12 sm:py-14 lg:items-center lg:py-16">
          <div className="w-full max-w-sm">
            <h1 className="mb-8 text-center text-2xl font-bold text-gray-800 lg:text-left">
              Ingresa a Minsa Digital
            </h1>

            <FakeField label="Tipo de documento">
              <div className="flex items-center justify-between rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-700">
                DNI - Documento Nacional de Identidad
                <ChevronDownIcon className="h-4 w-4 flex-shrink-0 text-gray-400" />
              </div>
            </FakeField>

            <FakeField label="Número de documento">
              <div className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-400">
                Ingresa tu número de documento
              </div>
            </FakeField>

            <FakeField label="Contraseña">
              <div className="flex items-center justify-between rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-400">
                Ingresa tu contraseña
                <EyeIcon className="h-4 w-4 flex-shrink-0 text-gray-400" />
              </div>
            </FakeField>

            <p className="mb-6 text-sm font-medium text-[#1E88E5]">¿Olvidaste tu contraseña?</p>

            <div className="mb-2 flex items-center gap-1.5 text-sm font-medium text-[#1E88E5]">
              Recargar Captcha
              <RefreshIcon className="h-3.5 w-3.5" />
            </div>
            <FakeCaptcha className="mb-3" />

            <FakeField label={null}>
              <div className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-400">
                Ingresa el captcha
              </div>
            </FakeField>

            <div className="mb-6 rounded-lg bg-[#4FA8E8] py-3 text-center text-sm font-bold text-white">
              Ingresar de manera segura
            </div>

            <p className="mb-1 text-center text-xs text-gray-500">
              Si eres mayor de 18 años, podrás acceder a la plataforma
            </p>
            <p className="text-center text-xs font-medium text-[#1E88E5]">¿Eres nuevo? Crea tu cuenta</p>
          </div>
        </div>
      </div>

      <div className="h-10 bg-slate-900" />
    </div>
  );
}

function FakeField({ label, children }: { label: string | null; children: ReactNode }) {
  return (
    <div className="mb-4">
      {label && <p className="mb-1.5 text-sm font-semibold text-gray-700">{label}</p>}
      {children}
    </div>
  );
}

function FakeCaptcha({ className }: { className?: string }) {
  const glyphs: { char: string; color: string; rotate: number }[] = [
    { char: "S", color: "#2E7D32", rotate: -8 },
    { char: "w", color: "#1E293B", rotate: 6 },
    { char: "9", color: "#7B1FA2", rotate: -4 },
    { char: "x", color: "#F9A825", rotate: 10 },
    { char: "4", color: "#C62828", rotate: -6 },
  ];

  return (
    <div className={`flex h-14 items-center justify-center gap-1 rounded-lg bg-gray-50 ${className ?? ""}`}>
      {glyphs.map((g, i) => (
        <span
          key={i}
          className="text-2xl font-bold italic"
          style={{ color: g.color, transform: `rotate(${g.rotate}deg)` }}
        >
          {g.char}
        </span>
      ))}
    </div>
  );
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function EyeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M23 4v6h-6" />
      <path d="M1 20v-6h6" />
      <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
    </svg>
  );
}

function QrIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
      <path d="M14 14h3v3h-3zM20 14h1v1h-1zM14 20h1v1h-1zM20 20h1v1h-1z" />
    </svg>
  );
}
