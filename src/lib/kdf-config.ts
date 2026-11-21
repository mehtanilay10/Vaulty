/**
 * Central PBKDF2 configuration.
 *
 * Client-side key derivation and server-side validation must agree on these
 * values, so they live in one dependency-free module importable from both the
 * browser and Node runtimes.
 */

export {
  CURRENT_PBKDF2_ITERATIONS,
  PBKDF2_ITERATIONS,
  MAX_PBKDF2_ITERATIONS,
} from "@/lib/constants";
