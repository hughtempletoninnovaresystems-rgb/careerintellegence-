import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import bcrypt from "bcrypt";

export async function POST(request: Request) {
  try {
    const { name, email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required." },
        { status: 400 }
      );
    }

    // Check if the email already exists
    const existing = await sql`
      SELECT id
      FROM users
      WHERE email = ${email}
    `;

    if (existing.rowCount && existing.rowCount > 0) {
      return NextResponse.json(
        { error: "User already exists." },
        { status: 409 }
      );
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert the new user
    const result = await sql`
      INSERT INTO users (name, email, password)
      VALUES (${name}, ${email}, ${hashedPassword})
      RETURNING id, name, email;
    `;

    return NextResponse.json(result.rows[0], { status: 201 });

  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { error: "Registration failed." },
      { status: 500 }
    );
  }
}