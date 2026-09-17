import { sql } from "@vercel/postgres";
import { auth } from "@/auth";
import { AuthenticationRequiredError } from "./errors";

export async function getAuthenticatedUserId() {
  const session = await auth();
  const email = session?.user?.email;

  if (!email) {
    throw new AuthenticationRequiredError();
  }

  const result = await sql`
    SELECT id
    FROM users
    WHERE email=${email}
    LIMIT 1
  `;

  if (!result.rows.length) {
    throw new AuthenticationRequiredError();
  }

  return String(result.rows[0].id);
}
