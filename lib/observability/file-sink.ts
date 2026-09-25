import type { LogLevel, LogSink } from "@/lib/observability/types";

// Logs written to a folder per day: logs/19-09-2026/app.ndjson (everything) and
// alerts.ndjson (warn and error only, for a quick look at what went wrong).
//
// Meant for local runs and servers with a disk. On Vercel the filesystem is
// read-only and per instance, so there the durable copy is stdout — Vercel Logs.
// Writes are queued and asynchronous: a turn never waits for the disk, and a
// disk error is swallowed (logging must never break a citizen's turn).

export const LOG_TIME_ZONE = "America/Lima";

// "19-09-2026", in Lima time, so the day changes when the citizen's day does.
export function dateFolder(at: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: LOG_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
    .format(at)
    .replace(/\//g, "-");
}

export type FileSystemPort = {
  mkdir: (path: string, options: { recursive: true }) => Promise<unknown>;
  appendFile: (path: string, data: string) => Promise<void>;
};

async function nodeFileSystem(): Promise<FileSystemPort> {
  const fs = await import("node:fs/promises");
  return { mkdir: fs.mkdir, appendFile: (path, data) => fs.appendFile(path, data) };
}

export type DailyFileSink = LogSink & { flush: () => Promise<void> };

export function createDailyFileSink(options: {
  dir: string;
  now?: () => Date;
  fileSystem?: () => Promise<FileSystemPort>;
}): DailyFileSink {
  const now = options.now ?? (() => new Date());
  const loadFileSystem = options.fileSystem ?? nodeFileSystem;
  const madeFolders = new Set<string>();
  let queue: Promise<void> = Promise.resolve();

  const write = async (level: LogLevel, line: string, at: Date): Promise<void> => {
    try {
      const fs = await loadFileSystem();
      const folder = `${options.dir}/${dateFolder(at)}`;
      if (!madeFolders.has(folder)) {
        await fs.mkdir(folder, { recursive: true });
        madeFolders.add(folder);
      }
      await fs.appendFile(`${folder}/app.ndjson`, `${line}\n`);
      if (level !== "info") await fs.appendFile(`${folder}/alerts.ndjson`, `${line}\n`);
    } catch {
      // A full or read-only disk must not surface as a failed turn.
    }
  };

  const sink = ((level: LogLevel, line: string) => {
    const at = now();
    queue = queue.then(() => write(level, line, at));
  }) as DailyFileSink;

  sink.flush = () => queue;
  return sink;
}
