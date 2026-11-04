import { isVercelSignInConfigured } from "./auth";
import { isSessionOwnerStoreConfigured } from "./session-owners";

/**
 * Production mode needs both: team sign-in, and the private Blob store that
 * keeps each chat to its owner (and holds the chat history).
 */
export const isProductionMode = (): boolean =>
  isVercelSignInConfigured && isSessionOwnerStoreConfigured();
