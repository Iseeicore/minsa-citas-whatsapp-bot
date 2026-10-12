"use client";

import { Button } from "@/app/components/ui/Button";
import { ButtonVariant } from "@/lib/enums/button-variant";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <div style={{ padding: 24, fontFamily: "sans-serif" }}>
          <h2>Something went wrong.</h2>
          <Button variant={ButtonVariant.UNSTYLED} onClick={() => reset()}>
            Try again
          </Button>
        </div>
      </body>
    </html>
  );
}
