/**
 * The block-type names the current build understands.
 *
 * Kept in a zod-free module so the browser half can import the runtime guard
 * without dragging the host's schema (and zod) into the single-file client
 * bundle. `lesson.ts` owns validation; this module owns the shared vocabulary.
 */

import type { KnownBlock, StoredBlock } from './lesson.js'

export const KNOWN_BLOCK_TYPE_NAMES = [
  'text',
  'example',
  'diagram',
  'check',
  'formula',
  'code',
  'quiz',
  'flashcard',
  'resource',
  'comparison',
] as const

const KNOWN = new Set<string>(KNOWN_BLOCK_TYPE_NAMES)

/** Narrow stored data to the renderer registry without importing the validation library. */
export function isKnownBlock(block: StoredBlock): block is KnownBlock {
  return KNOWN.has(block.type)
}
