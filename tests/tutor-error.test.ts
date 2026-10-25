/** Provider errors become actionable buckets, not raw 403 dumps. */

import { describe, expect, it } from 'vitest'

import { classifyTutorError } from '../src/client/tutor-error.js'

describe('classifying tutor turn failures', () => {
  it('recognises billing, auth, rate limit, network and context failures', () => {
    expect(classifyTutorError('OpenAI API error (403): {"message":"insufficient balance","type":"billing_error"}')).toBe('billing')
    expect(classifyTutorError('401 Unauthorized: invalid api key')).toBe('auth')
    expect(classifyTutorError('429 Too Many Requests')).toBe('rate-limit')
    expect(classifyTutorError('fetch failed: ECONNREFUSED')).toBe('network')
    expect(classifyTutorError('pi-ai detected context overflow for model "gpt"')).toBe('context')
  })

  it('falls back to other and prefers billing over the generic 403 signal', () => {
    expect(classifyTutorError('something unexpected happened')).toBe('other')
    expect(classifyTutorError('OpenAI API error (403): insufficient balance')).toBe('billing')
  })
})
