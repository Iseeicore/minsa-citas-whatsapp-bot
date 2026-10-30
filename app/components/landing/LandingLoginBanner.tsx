const TITULO_TEXT = "Ingresa con tu DNI y gestiona tus citas";
const DETALLE_TEXT = "Cita presencial, atención virtual, historia clínica y carné de vacunación.";
const INGRESAR_TEXT = "Ingresar";

export function LandingLoginBanner({ loginUrl }: { loginUrl: string | undefined }) {
  return (
    <section className="-mt-4 flex items-center justify-between gap-4 rounded-3xl bg-landing-search-mobile bg-cover px-5 py-4 text-white md:mx-landing-search-gutter md:mt-3 md:gap-10 md:bg-landing-search md:px-12 md:py-4">
      <div>
        <p className="font-gotham text-base leading-tight font-bold md:text-3xl">{TITULO_TEXT}</p>
        <p className="mt-1 hidden text-white/90 md:text-xl landing-tall:block">{DETALLE_TEXT}</p>
      </div>
      <a
        href={loginUrl}
        className="shrink-0 rounded-full bg-white px-6 py-2 font-gotham font-bold text-brand-navy shadow-lg transition hover:scale-105 md:px-14 md:py-3 md:text-2xl"
      >
        {INGRESAR_TEXT}
      </a>
    </section>
  );
}
