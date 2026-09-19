// PROPOSED fixes that are NOT in lib/ yet, kept here so tests can evaluate them
// before anyone decides to adopt them. (The initials exemption, the INEI
// place-name exemption and the cita-hint extraction were adopted and now live in
// lib/security and lib/fsm.)

// ---- Serialize turns per waId ---------------------------------------------
// In-process keyed mutex: turns of the same key run strictly in arrival order.
// (A multi-instance deployment additionally needs a DB lock, e.g.
// pg_advisory_xact_lock(hashtext(waId)) around getSession..saveSession.)
export function createKeyedMutex() {
  const tails = new Map<string, Promise<void>>();

  return async function run<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = tails.get(key) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.then(() => gate);
    tails.set(key, tail);

    await previous;
    try {
      return await task();
    } finally {
      release();
      if (tails.get(key) === tail) tails.delete(key);
    }
  };
}
