/**
 * ---------------------------------------------------------------------------
 *  Typed payment failures — one vocabulary for the scanner, the API and the UI.
 * ---------------------------------------------------------------------------
 *  Every failure in the QR payment flow carries a code, so the client can show
 *  a specific message *and* the right recovery affordance instead of a generic
 *  "something went wrong". Server routes return `{ error, code }`; the client
 *  looks the code up here. Unknown codes fall back to a safe default, so an
 *  older client never renders an empty error.
 * ---------------------------------------------------------------------------
 */

export type PaymentErrorCode =
  // --- reading the code -----------------------------------------------------
  | "qr_unreadable"
  | "qr_unsupported"
  | "qr_malformed"
  | "qr_tampered"
  | "qr_expired"
  | "qr_wrong_network"
  | "qr_unsupported_asset"
  | "qr_self_payment"
  // --- the request behind the code -----------------------------------------
  | "request_not_found"
  | "request_cancelled"
  | "request_already_paid"
  // --- the recipient --------------------------------------------------------
  | "recipient_not_found"
  | "recipient_cannot_receive"
  // --- the payer ------------------------------------------------------------
  | "wallet_not_ready"
  | "insufficient_funds"
  | "amount_required"
  | "amount_invalid"
  | "amount_too_small"
  | "amount_too_large"
  // --- the transfer ---------------------------------------------------------
  | "intent_expired"
  | "intent_invalid"
  | "duplicate_submission"
  | "transfer_failed"
  // --- device / transport ---------------------------------------------------
  | "camera_denied"
  | "camera_unavailable"
  | "camera_insecure_context"
  | "image_too_large"
  | "image_unsupported"
  | "image_corrupt"
  | "rate_limited"
  | "network_error"
  | "server_error";

/** What the UI should offer the user next. */
export type RecoveryAction =
  | "rescan"
  | "retry"
  | "edit_amount"
  | "choose_upload"
  | "open_settings"
  | "add_funds"
  | "dismiss";

export interface PaymentErrorInfo {
  title: string;
  message: string;
  /** Primary recovery affordance. */
  recovery: RecoveryAction;
  /** Label for the recovery button. */
  recoveryLabel: string;
  /** HTTP status the API should answer with. */
  status: number;
}

const FALLBACK: PaymentErrorInfo = {
  title: "Something went wrong",
  message: "We couldn't complete that just now. Please try again.",
  recovery: "retry",
  recoveryLabel: "Try again",
  status: 500,
};

export const PAYMENT_ERRORS: Record<PaymentErrorCode, PaymentErrorInfo> = {
  qr_unreadable: {
    title: "Couldn't read that code",
    message:
      "The QR code wasn't clear enough to read. Hold steady, move a little closer, and make sure the whole code is inside the frame.",
    recovery: "rescan",
    recoveryLabel: "Scan again",
    status: 400,
  },
  qr_unsupported: {
    title: "Not a RemitWise payment code",
    message:
      "This QR code isn't a payment code we can pay. RemitWise accepts RemitWise codes, Stellar payment links and Stellar wallet addresses.",
    recovery: "rescan",
    recoveryLabel: "Scan another code",
    status: 400,
  },
  qr_malformed: {
    title: "This code looks damaged",
    message:
      "The payment details in this code are incomplete or corrupted. Ask the recipient to show you a fresh code.",
    recovery: "rescan",
    recoveryLabel: "Scan again",
    status: 400,
  },
  qr_tampered: {
    title: "This code failed its security check",
    message:
      "The payment details don't match the code's signature, so it may have been edited after it was created. For your safety we won't send anything — ask the recipient for a new code.",
    recovery: "rescan",
    recoveryLabel: "Scan a new code",
    status: 400,
  },
  qr_expired: {
    title: "This payment request expired",
    message:
      "Payment codes are short-lived for your protection. Ask the recipient to generate a new one.",
    recovery: "rescan",
    recoveryLabel: "Scan a new code",
    status: 410,
  },
  qr_wrong_network: {
    title: "Wrong Stellar network",
    message:
      "This code is for a different Stellar network than your wallet is on, so the payment would never arrive.",
    recovery: "rescan",
    recoveryLabel: "Scan another code",
    status: 400,
  },
  qr_unsupported_asset: {
    title: "Unsupported currency",
    message: "RemitWise sends USDC. This code asks for a different asset.",
    recovery: "rescan",
    recoveryLabel: "Scan another code",
    status: 400,
  },
  qr_self_payment: {
    title: "That's your own code",
    message: "You can't send money to yourself. Scan the recipient's code instead.",
    recovery: "rescan",
    recoveryLabel: "Scan another code",
    status: 400,
  },
  request_not_found: {
    title: "Payment request not found",
    message:
      "This request no longer exists. Ask the recipient to create a new payment code.",
    recovery: "rescan",
    recoveryLabel: "Scan a new code",
    status: 404,
  },
  request_cancelled: {
    title: "Request cancelled",
    message: "The recipient cancelled this payment request, so it can't be paid.",
    recovery: "rescan",
    recoveryLabel: "Scan a new code",
    status: 409,
  },
  request_already_paid: {
    title: "Already paid",
    message:
      "This request has already been paid — sending again would charge you twice. Check your activity to see the original payment.",
    recovery: "dismiss",
    recoveryLabel: "Close",
    status: 409,
  },
  recipient_not_found: {
    title: "Recipient not found",
    message:
      "We couldn't find the account behind this code. Double-check with the recipient before sending.",
    recovery: "rescan",
    recoveryLabel: "Scan again",
    status: 404,
  },
  recipient_cannot_receive: {
    title: "Recipient can't receive USDC yet",
    message:
      "This Stellar account isn't set up to hold USDC, so the payment would bounce. Ask the recipient to activate their wallet first.",
    recovery: "rescan",
    recoveryLabel: "Scan another code",
    status: 409,
  },
  wallet_not_ready: {
    title: "Your wallet is still activating",
    message:
      "RemitWise is sponsoring your Stellar account and USDC trustline. This takes a few seconds — try again shortly.",
    recovery: "retry",
    recoveryLabel: "Try again",
    status: 409,
  },
  insufficient_funds: {
    title: "Not enough available balance",
    message:
      "This payment is more than your available balance. Lower the amount, or move money out of your savings vault first.",
    recovery: "edit_amount",
    recoveryLabel: "Change amount",
    status: 409,
  },
  amount_required: {
    title: "Enter an amount",
    message: "This code doesn't specify an amount, so you need to enter one.",
    recovery: "edit_amount",
    recoveryLabel: "Enter amount",
    status: 400,
  },
  amount_invalid: {
    title: "Invalid amount",
    message: "Enter an amount greater than zero, with at most two decimals.",
    recovery: "edit_amount",
    recoveryLabel: "Change amount",
    status: 400,
  },
  amount_too_small: {
    title: "Amount is too small",
    message: "The smallest payment RemitWise can send is $0.50.",
    recovery: "edit_amount",
    recoveryLabel: "Change amount",
    status: 400,
  },
  amount_too_large: {
    title: "Amount is too large",
    message: "Single payments are capped at $10,000 for your protection.",
    recovery: "edit_amount",
    recoveryLabel: "Change amount",
    status: 400,
  },
  intent_expired: {
    title: "This review timed out",
    message:
      "Payment details are only held for a few minutes. Scan the code again to refresh them.",
    recovery: "rescan",
    recoveryLabel: "Scan again",
    status: 410,
  },
  intent_invalid: {
    title: "Payment details couldn't be verified",
    message: "Please scan the code again to start a fresh payment.",
    recovery: "rescan",
    recoveryLabel: "Scan again",
    status: 400,
  },
  duplicate_submission: {
    title: "Payment already in progress",
    message:
      "This payment is already being processed — we won't send it twice. Give it a moment, then check your activity.",
    recovery: "dismiss",
    recoveryLabel: "Close",
    status: 409,
  },
  transfer_failed: {
    title: "Payment didn't go through",
    message:
      "The transfer couldn't be settled on Stellar, so nothing left your balance. You can safely try again.",
    recovery: "retry",
    recoveryLabel: "Try again",
    status: 502,
  },
  camera_denied: {
    title: "Camera access blocked",
    message:
      "RemitWise needs camera permission to scan a QR code. Allow camera access in your browser's site settings, or upload a photo of the code instead.",
    recovery: "choose_upload",
    recoveryLabel: "Upload an image",
    status: 400,
  },
  camera_unavailable: {
    title: "No camera available",
    message:
      "We couldn't find a camera on this device, or another app is using it. You can upload a photo of the QR code instead.",
    recovery: "choose_upload",
    recoveryLabel: "Upload an image",
    status: 400,
  },
  camera_insecure_context: {
    title: "Camera needs a secure connection",
    message:
      "Browsers only allow camera access over HTTPS. Open RemitWise over a secure connection, or upload a photo of the code.",
    recovery: "choose_upload",
    recoveryLabel: "Upload an image",
    status: 400,
  },
  image_too_large: {
    title: "Image is too large",
    message: "Choose an image under 12 MB, or take a fresh photo of the code.",
    recovery: "choose_upload",
    recoveryLabel: "Choose another image",
    status: 413,
  },
  image_unsupported: {
    title: "Unsupported image",
    message: "Upload a PNG, JPEG, WebP, GIF, BMP or SVG image of the QR code.",
    recovery: "choose_upload",
    recoveryLabel: "Choose another image",
    status: 415,
  },
  image_corrupt: {
    title: "Couldn't open that image",
    message:
      "The file appears to be damaged or isn't really an image. Try another photo of the code.",
    recovery: "choose_upload",
    recoveryLabel: "Choose another image",
    status: 400,
  },
  rate_limited: {
    title: "Too many attempts",
    message: "Please wait a moment before trying again.",
    recovery: "retry",
    recoveryLabel: "Try again",
    status: 429,
  },
  network_error: {
    title: "Connection problem",
    message:
      "We couldn't reach RemitWise. Check your connection and try again — no money has moved.",
    recovery: "retry",
    recoveryLabel: "Try again",
    status: 503,
  },
  server_error: FALLBACK,
};

export function paymentErrorInfo(code: string | undefined | null): PaymentErrorInfo {
  if (!code) return FALLBACK;
  return PAYMENT_ERRORS[code as PaymentErrorCode] ?? FALLBACK;
}

/**
 * A failure with a stable code. `message` defaults to the catalogue copy so a
 * thrown error is always presentable, but callers may override it when they
 * have something more specific (e.g. an anchor's own reason).
 */
export class PaymentError extends Error {
  readonly code: PaymentErrorCode;
  readonly status: number;

  constructor(code: PaymentErrorCode, message?: string) {
    const info = PAYMENT_ERRORS[code] ?? FALLBACK;
    super(message ?? info.message);
    this.name = "PaymentError";
    this.code = code;
    this.status = info.status;
  }
}

export function isPaymentError(err: unknown): err is PaymentError {
  return err instanceof PaymentError;
}
