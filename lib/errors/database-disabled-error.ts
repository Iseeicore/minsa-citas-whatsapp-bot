export class DatabaseDisabledError extends Error {
  constructor() {
    super("Prisma was used while DATABASE_ENABLED=false; this code path must not touch the database");
    this.name = "DatabaseDisabledError";
  }
}
