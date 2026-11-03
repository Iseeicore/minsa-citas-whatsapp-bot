export function LandingHero() {
  return (
    <section className="min-h-0 flex-1 overflow-hidden rounded-3xl bg-landing-hero-mobile bg-cover bg-top md:bg-landing-hero md:bg-right">
      <div className="px-5 py-4 md:w-3/5 md:px-0 md:py-landing-hero-y md:text-center">
        <h1 className="font-montserrat text-4xl leading-none font-extrabold md:text-landing-hero">
          <span className="text-brand-teal">Tu salud,</span>
          <br />
          más cerca
        </h1>
        <p className="mt-2 max-w-56 text-xs font-medium md:mx-auto md:max-w-none md:text-landing-lead">Accede a nuestros servicios de manera fácil, rápida y segura.</p>
      </div>
    </section>
  );
}
