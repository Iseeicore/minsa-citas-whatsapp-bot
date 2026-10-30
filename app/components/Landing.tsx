import Image from "next/image";

const NAV_LINK = "text-sm font-semibold uppercase text-gray-600 hover:text-brand-navy";

const SERVICES = [
  {
    title: "Programa tu cita presencial",
    chat: true,
    icon: "icono-cita",
    bg: "bg-[url(/landing/cita-m.webp)] md:bg-[url(/landing/cita.webp)]",
    color: "text-brand-teal",
  },
  {
    title: "Atención virtual inmediata",
    icon: "icono-virtual",
    bg: "bg-[url(/landing/virtual-m.webp)] md:bg-[url(/landing/virtual.webp)]",
    color: "text-brand-blue",
  },
  {
    title: "Más servicios",
    detail: "Historia clínica, carné de vacunación, entre otras",
    icon: "icono-servicios",
    bg: "bg-[url(/landing/servicios-m.webp)] md:bg-[url(/landing/servicios.webp)]",
    color: "text-brand-navy",
  },
];

const CHAT_LINK = { href: "#chat", "data-open-chat": true };

export default function Landing({ loginUrl }: { loginUrl: string }) {
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-brand-sky bg-[url(/landing/fondo-m.webp)] bg-cover font-poppins text-brand-navy md:bg-[url(/landing/fondo.webp)]">
      <div className="mx-auto flex min-h-0 w-full max-w-[1920px] flex-1 flex-col px-5 pb-28 md:px-10 md:pb-32">
        <header className="flex items-center justify-between gap-4 py-3 md:px-[4%] md:py-4">
          <Image src="/landing/logo.webp" alt="Minsa Responde" width={400} height={162} className="h-10 w-auto md:h-16" priority />
          <nav className="mr-auto hidden gap-8 pl-12 md:flex">
            <a href="#" className={`${NAV_LINK} border-b-2 border-brand-navy text-brand-navy`}>Inicio</a>
            <a href={loginUrl} className={NAV_LINK}>Servicios</a>
            <a {...CHAT_LINK} className={NAV_LINK}>Citas en línea</a>
          </nav>
          <div className="flex items-center gap-3">
            <a href="tel:113" aria-label="Llamar al 113">
              <Image src="/landing/telefono.webp" alt="" width={100} height={100} className="size-9 md:size-12" />
            </a>
            <a
              href={loginUrl}
              className="flex items-center gap-2 rounded-lg bg-[url(/landing/dni-boton.webp)] bg-cover px-4 py-2 text-xs font-bold text-white uppercase md:px-8 md:py-3 md:text-sm"
            >
              Ingresar con DNI
            </a>
          </div>
        </header>

        <section className="min-h-0 flex-1 overflow-hidden rounded-3xl bg-[url(/landing/hero-m.webp)] bg-cover bg-top md:bg-[url(/landing/hero.webp)] md:bg-right">
          <div className="px-5 py-4 md:w-3/5 md:px-0 md:py-[2vh] md:text-center">
            <h1 className="font-montserrat text-4xl leading-none font-extrabold md:text-[min(5vw,8vh)]">
              <span className="text-brand-teal">Tu salud,</span>
              <br />
              más cerca
            </h1>
            <p className="mt-2 max-w-56 text-xs font-medium md:mx-auto md:max-w-none md:text-[min(1.4vw,2.6vh)]">
              Accede a nuestros servicios de manera fácil, rápida y segura.
            </p>
          </div>
        </section>

        <section className="-mt-4 flex items-center justify-between gap-4 rounded-3xl bg-[url(/landing/search-m.webp)] bg-cover px-5 py-4 text-white md:mx-[4.5%] md:mt-3 md:gap-10 md:bg-[url(/landing/search.webp)] md:px-12 md:py-4">
          <div>
            <p className="font-gotham text-base leading-tight font-bold md:text-3xl">Ingresa con tu DNI y gestiona tus citas</p>
            <p className="mt-1 hidden text-white/90 md:text-xl [@media(min-height:900px)]:block">
              Cita presencial, atención virtual, historia clínica y carné de vacunación.
            </p>
          </div>
          <a
            href={loginUrl}
            className="shrink-0 rounded-full bg-white px-6 py-2 font-gotham font-bold text-brand-navy shadow-lg transition hover:scale-105 md:px-14 md:py-3 md:text-2xl"
          >
            Ingresar
          </a>
        </section>

        <h2 className="mt-4 font-gotham text-xl font-bold md:mt-5 md:text-4xl">¿Qué deseas hacer hoy?</h2>
        <p className="text-xs md:text-xl">Accede rápidamente a los principales servicios de salud.</p>

        <ul className="mt-3 grid min-h-0 flex-1 grid-rows-3 gap-2 md:max-h-36 md:grid-cols-3 md:grid-rows-1 md:gap-7">
          {SERVICES.map(({ title, detail, icon, bg, color, chat }) => (
            <li key={title} className="min-h-0">
              <a
                {...(chat ? CHAT_LINK : { href: loginUrl })}
                className={`flex h-full items-center gap-3 rounded-2xl bg-cover bg-right py-2 pl-4 max-md:pr-[40%] md:gap-4 md:pr-[30%] md:pl-10 ${bg}`}
              >
                <Image src={`/landing/${icon}.webp`} alt="" width={160} height={160} className="size-12 shrink-0 md:size-20" />
                <span className={color}>
                  <span className="block font-gotham text-base leading-tight font-bold md:text-xl lg:text-2xl">{title}</span>
                  {detail && <span className="hidden text-xs md:text-base lg:block">{detail}</span>}
                </span>
              </a>
            </li>
          ))}
        </ul>
      </div>

      <Image
        src="/landing/accesibilidad.webp"
        alt="Accesibilidad"
        width={200}
        height={198}
        className="fixed right-4 bottom-4 z-10 size-16 md:size-24"
      />
    </div>
  );
}
