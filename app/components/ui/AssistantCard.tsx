import Image from "next/image";

const SIZE_CLASSES = {
  fixed: {
    image: "h-24 sm:h-32",
    panel: "-ml-6 mb-2 py-3 pl-8 pr-4 sm:-ml-8 sm:mb-3 sm:py-4 sm:pl-10",
    title: "text-base sm:text-xl",
    subtitle: "mt-0.5 text-xs sm:mt-1 sm:text-sm",
  },
  fluid: {
    image: "h-24 sm:h-32 @xl:h-40 @2xl:h-48",
    panel:
      "-ml-6 mb-2 py-3 pl-8 pr-4 sm:-ml-8 sm:mb-3 sm:py-4 sm:pl-10 @xl:-ml-10 @xl:mb-4 @xl:py-5 @xl:pl-12 @xl:pr-6 @2xl:-ml-12 @2xl:mb-5 @2xl:py-6 @2xl:pl-14 @2xl:pr-8",
    title: "text-base sm:text-xl @xl:text-2xl @2xl:text-3xl",
    subtitle: "mt-0.5 text-xs sm:mt-1 sm:text-sm @xl:text-base @2xl:text-lg",
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
      <span className="flex items-end whitespace-nowrap">
        <Image
          src="/promotora-minsa.png"
          alt="Asistente virtual MINS IA"
          width={325}
          height={480}
          className={`relative z-10 w-auto shrink-0 ${sizes.image}`}
          priority
        />
        <span className={`shrink-0 rounded-2xl bg-sb-navy text-white shadow-sm ${sizes.panel}`}>
          <span className={`block font-extrabold leading-tight ${sizes.title}`}>Soy MINS IA</span>
          <span className={`block text-white/80 ${sizes.subtitle}`}>Soy la asistente virtual del MINSA</span>
        </span>
      </span>
    </span>
  );
}
