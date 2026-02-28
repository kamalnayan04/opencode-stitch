import { describe, expect, test } from "bun:test"
import { isOAuthToken, parseJWT, validateOAuthToken, extractUserFromToken } from "../src/routes/zen/util/oauth-validator"

describe("isOAuthToken", () => {
  test("returns true for valid JWT format", () => {
    const jwt = "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiZW1haWwiOiJqb2huQGV4YW1wbGUuY29tIn0.signature"
    expect(isOAuthToken(jwt)).toBe(true)
  })

  test("returns false for API key format", () => {
    const apiKey = "ock_01K46JDFR0E75SG2Q8K172KF3Y"
    expect(isOAuthToken(apiKey)).toBe(false)
  })

  test("returns false for empty string", () => {
    expect(isOAuthToken("")).toBe(false)
  })

  test("returns false for undefined", () => {
    expect(isOAuthToken(undefined as any)).toBe(false)
  })

  test("returns false for JWT with only 2 parts", () => {
    const invalid = "header.payload"
    expect(isOAuthToken(invalid)).toBe(false)
  })

  test("returns false for JWT with special characters", () => {
    const invalid = "header.payload.signature!"
    expect(isOAuthToken(invalid)).toBe(false)
  })
})

describe("parseJWT", () => {
  test("parses valid JWT and returns payload", () => {
    // JWT with payload: {"sub":"123","name":"John Doe","email":"john@example.com","exp":9999999999}
    const jwt = "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjMiLCJuYW1lIjoiSm9obiBEb2UiLCJlbWFpbCI6ImpvaG5AZXhhbXBsZS5jb20iLCJleHAiOjk5OTk5OTk5OTl9.signature"
    const payload = parseJWT(jwt)
    
    expect(payload).toBeDefined()
    expect(payload.sub).toBe("123")
    expect(payload.name).toBe("John Doe")
    expect(payload.email).toBe("john@example.com")
  })

  test("throws error for invalid JWT format", () => {
    expect(() => parseJWT("invalid")).toThrow()
  })

  test("throws error for malformed base64", () => {
    expect(() => parseJWT("header.!!!.signature")).toThrow()
  })
})

describe("validateOAuthToken", () => {
  test("returns valid for properly formatted JWT", () => {
    // JWT with future expiry
    const jwt = "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjMiLCJuYW1lIjoiSm9obiBEb2UiLCJlbWFpbCI6ImpvaG5AZXhhbXBsZS5jb20iLCJleHAiOjk5OTk5OTk5OTl9.signature"
    const result = validateOAuthToken(jwt)
    
    expect(result.valid).toBe(true)
    expect(result.error).toBeUndefined()
  })

  test("returns invalid for expired token", () => {
    // JWT with past expiry (exp: 1000000000 = Sep 2001)
    const jwt = "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjMiLCJuYW1lIjoiSm9obiBEb2UiLCJlbWFpbCI6ImpvaG5AZXhhbXBsZS5jb20iLCJleHAiOjEwMDAwMDAwMDB9.signature"
    const result = validateOAuthToken(jwt)
    
    expect(result.valid).toBe(false)
    expect(result.error).toContain("expired")
  })

  test("returns invalid for JWT without expiry", () => {
    // JWT without exp claim
    const jwt = "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjMiLCJuYW1lIjoiSm9obiBEb2UiLCJlbWFpbCI6ImpvaG5AZXhhbXBsZS5jb20ifQ.signature"
    const result = validateOAuthToken(jwt)
    
    expect(result.valid).toBe(false)
    expect(result.error).toContain("expiry")
  })

  test("returns invalid for malformed JWT", () => {
    const result = validateOAuthToken("not.a.jwt")
    
    expect(result.valid).toBe(false)
    expect(result.error).toBeDefined()
  })
})

describe("extractUserFromToken", () => {
  test("extracts user info from valid JWT", () => {
    const jwt = "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiZW1haWwiOiJqb2huQGV4YW1wbGUuY29tIiwiZXhwIjo5OTk5OTk5OTk5fQ.signature"
    const user = extractUserFromToken(jwt)
    
    expect(user.userId).toBe("1234567890")
    expect(user.email).toBe("john@example.com")
    expect(user.name).toBe("John Doe")
  })

  test("handles missing name in JWT", () => {
    // JWT without name
    const jwt = "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjMiLCJlbWFpbCI6ImpvaG5AZXhhbXBsZS5jb20iLCJleHAiOjk5OTk5OTk5OTl9.signature"
    const user = extractUserFromToken(jwt)
    
    expect(user.userId).toBe("123")
    expect(user.email).toBe("john@example.com")
    expect(user.name).toBeUndefined()
  })

  test("throws error when email is missing", () => {
    // JWT without email
    const jwt = "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjMiLCJuYW1lIjoiSm9obiBEb2UiLCJleHAiOjk5OTk5OTk5OTl9.signature"
    
    expect(() => extractUserFromToken(jwt)).toThrow("email")
  })

  test("throws error when sub is missing", () => {
    // JWT without sub
    const jwt = "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJuYW1lIjoiSm9obiBEb2UiLCJlbWFpbCI6ImpvaG5AZXhhbXBsZS5jb20iLCJleHAiOjk5OTk5OTk5OTl9.signature"
    
    expect(() => extractUserFromToken(jwt)).toThrow("userId")
  })
})
