import type { VercelPoolClient } from "@vercel/postgres";

export type CareerQueryClient = Pick<VercelPoolClient, "sql">;