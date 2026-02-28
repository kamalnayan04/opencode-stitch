/**
 * OAuth Token Validator
 * 
 * Provides functionality to detect, parse, and validate OAuth JWT tokens
 * for Stitch-CLI compatibility.
 */

/**
 * Detects if a token is in OAuth JWT format (xxx.yyy.zzz)
 * JWT tokens have 3 base64url-encoded parts separated by dots
 */
export function isOAuthToken(token: string | undefined): boolean {
  if (!token) return false
  
  // JWT format: header.payload.signature
  // Each part is base64url encoded (A-Za-z0-9_-)
  const jwtPattern = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/
  return jwtPattern.test(token)
}

/**
 * Parses a JWT token and returns the decoded payload
 * Does not verify signature - only decodes the payload
 */
export function parseJWT(token: string): any {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) {
      throw new Error('Invalid JWT format: must have 3 parts')
    }
    
    // Decode the payload (second part)
    const payload = parts[1]
    
    // JWT uses base64url encoding, convert to standard base64
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    
    // Decode base64 to string
    const jsonString = atob(base64)
    
    // Parse JSON
    return JSON.parse(jsonString)
  } catch (error) {
    throw new Error(`Failed to parse JWT: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Validates an OAuth token
 * Returns validation result with error message if invalid
 */
export function validateOAuthToken(token: string): { valid: boolean; error?: string } {
  try {
    // Check format
    if (!isOAuthToken(token)) {
      return {
        valid: false,
        error: 'Invalid token format: not a JWT'
      }
    }
    
    // Parse the token
    const payload = parseJWT(token)
    
    // Check for expiry claim
    if (!payload.exp) {
      return {
        valid: false,
        error: 'Invalid token: missing expiry claim'
      }
    }
    
    // Check if token is expired
    const now = Math.floor(Date.now() / 1000) // Current time in seconds
    if (payload.exp < now) {
      return {
        valid: false,
        error: 'Token expired'
      }
    }
    
    return { valid: true }
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Token validation failed'
    }
  }
}

/**
 * Extracts user information from a JWT token
 * Throws error if required fields are missing
 */
export function extractUserFromToken(token: string): {
  userId: string
  email: string
  name?: string
} {
  const payload = parseJWT(token)
  
  // Validate required fields
  if (!payload.sub) {
    throw new Error('Invalid token: missing userId (sub claim)')
  }
  
  if (!payload.email) {
    throw new Error('Invalid token: missing email claim')
  }
  
  return {
    userId: payload.sub,
    email: payload.email,
    name: payload.name
  }
}

/**
 * Type definition for OAuth validation result
 */
export interface OAuthValidationResult {
  valid: boolean
  userId?: string
  email?: string
  name?: string
  error?: string
}

/**
 * Complete OAuth token validation with user extraction
 * Combines validation and user extraction in one call
 */
export function validateAndExtractUser(token: string): OAuthValidationResult {
  // First validate the token
  const validation = validateOAuthToken(token)
  if (!validation.valid) {
    return validation
  }
  
  // Then extract user info
  try {
    const user = extractUserFromToken(token)
    return {
      valid: true,
      ...user
    }
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Failed to extract user info'
    }
  }
}
