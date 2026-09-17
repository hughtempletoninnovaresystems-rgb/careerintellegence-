export class CareerIntelligenceError extends Error {
  readonly status: number;
  readonly code: string;
  readonly expose: boolean;

  constructor(
    message: string,
    options: {
      status?: number;
      code?: string;
      expose?: boolean;
      cause?: unknown;
    } = {},
  ) {
    super(message);
    this.name = "CareerIntelligenceError";
    this.status = options.status ?? 500;
    this.code = options.code ?? "career_intelligence_error";
    this.expose = options.expose ?? false;
  }
}

export class AuthenticationRequiredError extends CareerIntelligenceError {
  constructor() {
    super("Authentication is required.", {
      status: 401,
      code: "authentication_required",
      expose: true,
    });
  }
}

export class ObjectAccessError extends CareerIntelligenceError {
  constructor() {
    // Deliberately does not distinguish missing from unauthorised objects.
    super("Role assessment not found.", {
      status: 404,
      code: "role_assessment_not_found",
      expose: true,
    });
  }
}

export class AIProviderError extends CareerIntelligenceError {
  constructor(message = "The AI assessment service returned an invalid response.") {
    super(message, {
      status: 502,
      code: "ai_provider_error",
      expose: true,
    });
  }
}
