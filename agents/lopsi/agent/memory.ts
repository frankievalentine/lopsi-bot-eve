import { defineMemory } from "eve/memory";
import { fileMemory } from "eve/memory/file";
import { byPrincipal } from "eve/memory/scope";
import { isProductionMode } from "../../../apps/web/lib/production-mode.js";

/**
 * What this crew member remembers about each person between chats: one short
 * document per person, in the private Blob store that production mode already
 * has. Off in starter mode, where everyone shares one identity (so everyone
 * would share one memory) and there may be no store, which would fail every
 * turn.
 */
export default defineMemory({
  description:
    "Stable facts and preferences about the person you're talking to that will help in later chats. Never save passwords, tokens, payment details, private keys or one-time codes.",
  provider: fileMemory(),
  scope: (ctx) => (isProductionMode() ? byPrincipal(ctx) : null),
});
