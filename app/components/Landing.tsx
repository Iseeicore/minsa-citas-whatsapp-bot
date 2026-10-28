import Image from "next/image";
import Link from "next/link";

const NAV_LINK = "text-sm font-semibold uppercase text-gray-600 hover:text-brand-navy";

const SERVICES = [
  {
    title: "Programa tu cita presencial",
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

export default function Landing({ loginUrl }: { loginUrl: string }) {
  return (
    <div className="px-10 min-h-dvh bg-brand-sky bg-[url(/landing/fondo-m.webp)] bg-cover font-poppins text-brand-navy md:bg-[url(/landing/fondo.webp)]">
      <div className="mx-auto max-w-[1920px] px-5 pb-32 md:px-8">
        <header className="flex items-center justify-between gap-4 py-5 md:px-[4%]">
          <Image src="/landing/logo.webp" alt="Minsa Responde" width={400} height={162} className="h-12 w-auto md:h-20" priority />
          <nav className="mr-auto hidden gap-8 pl-12 md:flex">
            <a href="#" className={`${NAV_LINK} border-b-2 border-brand-navy text-brand-navy`}>Inicio</a>
            <a href={loginUrl} className={NAV_LINK}>Servicios</a>
            <a href={loginUrl} className={NAV_LINK}>Citas en línea</a>
          </nav>
          <div className="flex items-center gap-3">
            <Image src="/landing/telefono.webp" alt="Teléfono de contacto" width={100} height={100} className="size-9 md:size-14" />
            <a
              href={loginUrl}
              className="flex items-center gap-2 rounded-lg bg-[url(/landing/dni-boton.webp)] bg-cover px-4 py-2 text-xs font-bold text-white uppercase md:px-8 md:py-4 md:text-sm"
            >
              Ingresar con DNI
            </a>
          </div>
        </header>

        <section className="overflow-hidden rounded-3xl bg-[url(/landing/hero-m.webp)] bg-cover bg-top md:bg-[url(/landing/hero.webp)] md:bg-right">
          <div className="px-5 py-8 md:w-3/5 md:px-0 md:py-14 md:text-center">
            <h1 className="font-montserrat text-4xl leading-none font-extrabold md:text-8xl">
              <span className="text-brand-teal">Tu salud,</span>
              <br />
              más cerca
            </h1>
            <p className="mt-3 max-w-56 text-xs font-medium md:mx-auto md:max-w-none md:text-2xl">
              Accede a nuestros servicios de manera fácil, rápida y segura.
            </p>
          </div>
        </section>
        <section className="mt-6 flex flex-col gap-4 rounded-3xl bg-[url(/landing/search-m.webp)] bg-cover px-6 py-6 text-white md:mx-[4.5%] md:-mt-10 md:flex-row md:items-center md:justify-between md:gap-10 md:bg-[url(/landing/search.webp)] md:px-14 md:py-6">
          <div>
            <p className="font-gotham text-2xl leading-tight font-bold md:text-3xl">Ingresa con tu DNI y gestiona tus citas</p>
            <p className="mt-2 text-sm text-white/90 md:text-2xl">
              Cita presencial, atención virtual, historia clínica y carné de vacunación.
            </p>
          </div>
          <Link
            href={loginUrl}
            className="shrink-0 rounded-full bg-white px-10 py-3 text-center font-gotham text-lg font-bold text-brand-navy shadow-lg transition hover:scale-105 md:px-16 md:py-4 md:text-2xl"
          >
            Ingresar
          </Link>
        </section>
        <h2 className="mt-10 font-gotham text-2xl font-bold md:text-4xl">¿Qué deseas hacer hoy?</h2>
        <p className="mt-1 text-sm md:text-2xl">Accede rápidamente a los principales servicios de salud.</p>

        <ul className="mt-6 grid gap-4 md:grid-cols-3 md:gap-7">
          {SERVICES.map(({ title, detail, icon, bg, color }) => (
            <li key={title}>
              <a href={loginUrl} className={`flex items-center gap-4 rounded-2xl bg-cover bg-right px-5 py-6 md:h-36 md:px-14 ${bg}`}>
                <Image src={`/landing/${icon}.webp`} alt="" width={160} height={160} className="size-14 md:size-20" />
                <span className={color}>
                  <span className="block max-w-48 font-gotham text-lg leading-tight font-bold md:text-2xl">{title}</span>
                  {detail && <span className="block max-w-56 text-xs md:text-lg">{detail}</span>}
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
