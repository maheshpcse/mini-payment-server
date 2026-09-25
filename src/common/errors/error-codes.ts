/**
 * Stable machine-readable error codes. Clients may branch on these values, so
 * existing codes must not be renamed; add new ones instead.
 */
export const ERROR_CODES = {
  VALIDATION_FAILED: { status: 400, message: 'The request contains invalid data.' },
  REQUEST_MALFORMED: { status: 400, message: 'The request body could not be parsed.' },
  REQUEST_TOO_LARGE: { status: 413, message: 'The request body is too large.' },
  UNAUTHENTICATED: { status: 401, message: 'Authentication is required.' },
  FORBIDDEN: { status: 403, message: 'You do not have permission to perform this action.' },
  RESOURCE_NOT_FOUND: { status: 404, message: 'The requested resource was not found.' },
  ROUTE_NOT_FOUND: { status: 404, message: 'The requested route does not exist.' },
  RATE_LIMITED: { status: 429, message: 'Too many requests. Please retry later.' },
  AUTH_INVALID_CREDENTIALS: { status: 401, message: 'The credentials are invalid.' },
  AUTH_SESSION_EXPIRED: { status: 401, message: 'Your session has ended. Please sign in again.' },
  AUTH_REGISTRATION_CONFLICT: {
    status: 409,
    message: 'An account cannot be created with these details. Try signing in or resetting your password.',
  },
  AUTH_RESET_TOKEN_INVALID: { status: 400, message: 'This password reset link is invalid or has expired.' },
  DEMO_ACCOUNT_RESTRICTED: { status: 403, message: 'This is a shared demo account, so this change is turned off.' },
  PROFILE_PHONE_UNAVAILABLE: { status: 409, message: 'This mobile number cannot be used for your profile.' },
  UNSUPPORTED_MEDIA_TYPE: { status: 415, message: 'The uploaded file type is not supported.' },
  PAYMENT_METHOD_DUPLICATE: { status: 409, message: 'This payment method is already linked.' },
  PAYMENT_METHOD_LIMIT_REACHED: { status: 422, message: 'You have linked the maximum number of payment methods.' },
  OTP_EXPIRED: { status: 400, message: 'The verification code has expired.' },
  OTP_TOO_MANY_ATTEMPTS: { status: 429, message: 'Too many verification attempts.' },
  PAYMENT_INVALID_AMOUNT: { status: 400, message: 'The payment amount is invalid.' },
  PAYMENT_INSUFFICIENT_FUNDS: { status: 422, message: 'The sandbox balance is insufficient.' },
  PAYMENT_INVALID_STATE: { status: 409, message: 'The payment cannot move to the requested state.' },
  PAYMENT_LIMIT_EXCEEDED: { status: 422, message: 'The payment exceeds the permitted limit.' },
  PAYMENT_DUPLICATE_REQUEST: { status: 409, message: 'A conflicting request with this idempotency key exists.' },
  PAYMENT_RECIPIENT_NOT_FOUND: { status: 404, message: 'The recipient could not be found.' },
  SERVICE_UNAVAILABLE: { status: 503, message: 'The service is temporarily unavailable.' },
  INTERNAL_ERROR: { status: 500, message: 'An unexpected error occurred.' },
} as const satisfies Record<string, { status: number; message: string }>;

export type ErrorCode = keyof typeof ERROR_CODES;
