import { sql } from "@vercel/postgres";
import type { CareerQueryClient } from "../data/query-client";

/**
 * Returns a SQL tagged-template executor that preserves the receiver required
 * by VercelPoolClient.sql when a connected transaction client is supplied.
 *
 * Never return client.sql unbound: @vercel/postgres implements it as an
 * instance method and relies on the client receiver internally.
 */
export function getCareerSql(
  client?: CareerQueryClient,
): CareerQueryClient["sql"] {
  return client
    ? client.sql.bind(client)
    : sql;
}
