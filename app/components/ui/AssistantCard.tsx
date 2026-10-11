import Image from "next/image";

const SIZE_CLASSES = {
  fixed: {
    image: "h-24 sm:h-32",
    panel: "-ml-6 mb-2 py-3 pl-8 pr-4 sm:-ml-8 sm:mb-3 sm:py-4 sm:pl-10",
    title: "text-base sm:text-xl",
    subtitle: "mt-0.5 text-xs sm:mt-1 sm:text-sm",
  },
  // Todo escala con el ancho del contenedor (cqw): la ilustración queda pegada a la izquierda y la burbuja ocupa el resto
  // del ancho, con una colita "<" hacia la ilustración. Los topes del clamp evitan que crezca de más en pantallas anchas.
  fluid: {
    image: "h-[clamp(6rem,30cqw,10rem)]",
    panel:
      "relative ml-[clamp(0.5rem,2.5cqw,1rem)] mb-[clamp(0.5rem,3cqw,1.25rem)] min-w-0 flex-1 whitespace-normal py-[clamp(0.75rem,3.5cqw,1.5rem)] pl-[clamp(1rem,5cqw,2rem)] pr-[clamp(0.75rem,3cqw,1.5rem)] " +
      "before:absolute before:right-full before:top-[clamp(0.75rem,4cqw,1.5rem)] before:h-0 before:w-0 before:content-[''] " +
      "before:border-y-[clamp(6px,2.2cqw,11px)] before:border-r-[clamp(8px,2.8cqw,14px)] before:border-y-transparent before:border-r-sb-navy",
    title: "text-[clamp(1rem,6cqw,1.875rem)]",
    subtitle: "mt-0.5 text-[clamp(0.75rem,3.6cqw,1.125rem)] sm:mt-1",
  },
};

export function AssistantCard({
  className = "",
  fluid = false,
}: {
  className?: string;
  fluid?: boolean;
}) {
  const sizes = SIZE_CLASSES[fluid ? "fluid" : "fixed"];

  return (
    <span className={`block text-left ${fluid ? "@container" : ""} ${className}`}>
      <span className={`flex items-end ${fluid ? "" : "whitespace-nowrap"}`}>
        <Image
          src="/promotora-minsa.png"
          alt="Asistente virtual MINS IA"
          width={325}
          height={480}
          className={`relative z-10 w-auto shrink-0 ${sizes.image}`}
          priority
        />
        <span className={`rounded-2xl bg-sb-navy text-white shadow-sm ${fluid ? "" : "shrink-0"} ${sizes.panel}`}>
          <span className={`block font-extrabold leading-tight ${sizes.title}`}>Soy MINS IA</span>
          <span className={`block text-white/80 ${sizes.subtitle}`}>Soy la asistente virtual del MINSA</span>
        </span>
      </span>
    </span>
  );
}
