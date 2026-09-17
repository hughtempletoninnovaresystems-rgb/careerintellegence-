import { NextResponse } from "next/server";
import { CareerIntelligenceError } from "../errors";

export function errorResponse(error: unknown, correlationId: string) {
  if (error instanceof CareerIntelligenceError) {
    console.error("Career Intelligence request failed", {
      correlationId,
      code: error.code,
      status: error.status,
      errorName: error.name,
    });

    return NextResponse.json(
      {
        error: error.expose ? error.message : "Unable to complete the request.",
        correlationId,
      },
      {
        status: error.status,
        headers: { "x-correlation-id": correlationId },
      },
    );
  }

  console.error("Career Intelligence request failed", {
    correlationId,
    errorName: error instanceof Error ? error.name : "unknown",
  });

  return NextResponse.json(
    {
      error: "Unexpected server error.",
      correlationId,
    },
    {
      status: 500,
      headers: { "x-correlation-id": correlationId },
    },
  );
}
