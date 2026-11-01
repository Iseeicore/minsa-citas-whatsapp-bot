import Image from "next/image";
import { cn } from "@/lib/utils/cn";

const FLUID_BUBBLE_SPACING = "mb-2 ml-2 py-3 pl-4 pr-3 @md:mb-3 @md:ml-3 @md:py-4 @md:pl-6 @xl:mb-4 @xl:ml-4 @xl:py-5 @xl:pl-7 @xl:pr-4";

const FLUID_BUBBLE_TAIL =
  "before:absolute before:right-full before:top-3 before:border-y-8 before:border-r-12 before:border-y-transparent before:border-r-white @md:before:top-4 @xl:before:top-6";

const SIZE_CLASSES = {
  fixed: {
    image: "h-24 sm:h-32",
    panel: "-ml-6 mb-2 py-3 pl-8 pr-4 sm:-ml-8 sm:mb-3 sm:py-4 sm:pl-10",
    title: "text-base sm:text-xl",
    subtitle: "mt-0.5 text-xs sm:mt-1 sm:text-sm",
  },
  fluid: {
    image: "h-24 @md:h-32 @xl:h-40",
    panel: cn("relative min-w-0 flex-1 whitespace-normal", FLUID_BUBBLE_SPACING, FLUID_BUBBLE_TAIL),
    title: "text-lg @md:text-2xl @xl:text-3xl",
    subtitle: "mt-0.5 text-xs sm:mt-1 @md:text-base @xl:text-lg",
  },
};

export function AssistantCard({
  className,
  fluid = false,
}: {
  className?: string;
  fluid?: boolean;
}) {
  const sizes = SIZE_CLASSES[fluid ? "fluid" : "fixed"];

  return (
    <span className={cn("block text-left", fluid && "@container", className)}>
      <span className={cn("flex items-end", !fluid && "whitespace-nowrap")}>
        <Image
          src="/landing/asistente.webp"
          alt="Asistente virtual"
          width={300}
          height={345}
          className={cn("relative z-10 w-auto shrink-0", sizes.image)}
          priority
        />
        <span className={cn("rounded-3xl bg-white shadow-lg", !fluid && "shrink-0", sizes.panel)}>
          <span className={cn("block font-extrabold text-brand-navy", sizes.title, "leading-tight")}>Soy tu asistente</span>
          <span className={cn("block text-gray-500", sizes.subtitle)}>¿En qué podemos ayudarte?</span>
        </span>
      </span>
    </span>
  );
}
