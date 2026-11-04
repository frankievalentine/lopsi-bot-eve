/**
 * Terminal prompts for the setup scripts: questions with defaults, yes/no,
 * and hidden input for secrets (nothing is echoed or printed). One readline
 * interface serves every prompt, so answers piped in arrive in order.
 */

import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";

/** @type {import("node:readline/promises").Interface | undefined} */
let shared;
let muted = false;

function prompts() {
  if (shared === undefined) {
    shared = createInterface({
      input: stdin,
      output: stdout,
      terminal: stdin.isTTY,
    });
    const write = shared._writeToOutput?.bind(shared);
    // While a secret is typed, echo nothing.
    shared._writeToOutput = (text) => {
      if (!muted) {
        write?.(text);
      }
    };
  }
  return shared;
}

/** Closes the prompts so the script can exit. */
export function closePrompts() {
  shared?.close();
  shared = undefined;
}

/**
 * Asks a question; an empty answer takes the default.
 *
 * @param {string} question
 * @param {string} [fallback]
 * @returns {Promise<string>}
 */
export async function ask(question, fallback = "") {
  const answer = (
    await prompts().question(
      `  ${question}${fallback ? ` (${fallback})` : ""}: `
    )
  ).trim();
  return answer || fallback;
}

/**
 * Asks a yes/no question.
 *
 * @param {string} question
 * @param {boolean} [fallback]
 * @returns {Promise<boolean>}
 */
export async function confirm(question, fallback = true) {
  const answer = (
    await ask(`${question} [${fallback ? "Y/n" : "y/N"}]`)
  ).toLowerCase();
  return answer === "" ? fallback : answer.startsWith("y");
}

/**
 * Asks for a secret without echoing it.
 *
 * @param {string} question
 * @returns {Promise<string>}
 */
export async function askSecret(question) {
  const rl = prompts();
  stdout.write(`  ${question}: `);
  muted = true;
  try {
    return (await rl.question("")).trim();
  } finally {
    muted = false;
    stdout.write("\n");
  }
}
