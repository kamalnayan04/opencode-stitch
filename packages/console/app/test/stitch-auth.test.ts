import { describe, expect, test, mock } from "bun:test"
import { authenticateWithOAuth, parseStitchHeaders } from "../src/routes/zen/util/stitch-auth"

describe("parseStitchHeaders", () => {
  test("extracts project name and auth key from headers", () => {
    const headers = new Headers({
      "grpc-metadata-x-project-name": "stitch",
      "grpc-metadata-x-project-auth-key": "stitch_prod_dorp_x7plq9"
    })
    
    const result = parseStitchHeaders(headers)
    expect(result.projectName).toBe("stitch")
    expect(result.authKey).toBe("stitch_prod_dorp_x7plq9")
  })

  test("handles case-insensitive headers", () => {
    const headers = new Headers({
      "Grpc-Metadata-X-Project-Name": "stitch",
      "Grpc-Metadata-X-Project-Auth-Key": "stitch_prod_dorp_x7plq9"
    })
    
    const result = parseStitchHeaders(headers)
    expect(result.projectName).toBe("stitch")
    expect(result.authKey).toBe("stitch_prod_dorp_x7plq9")
  })

  test("returns undefined when headers are missing", () => {
    const headers = new Headers()
    
    const result = parseStitchHeaders(headers)
    expect(result.projectName).toBeUndefined()
    expect(result.authKey).toBeUndefined()
  })

  test("returns partial result when only one header present", () => {
    const headers = new Headers({
      "grpc-metadata-x-project-name": "stitch"
    })
    
    const result = parseStitchHeaders(headers)
    expect(result.projectName).toBe("stitch")
    expect(result.authKey).toBeUndefined()
  })
})

describe("authenticateWithOAuth", () => {
  test("returns auth context for valid OAuth token with existing workspace", async () => {
    const token = "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiZW1haWwiOiJqb2huQGV4YW1wbGUuY29tIiwiZXhwIjo5OTk5OTk5OTk5fQ.signature"
    const headers = new Headers({
      "grpc-metadata-x-project-name": "stitch",
      "grpc-metadata-x-project-auth-key": "stitch_prod_dorp_x7plq9"
    })
    
    // Note: This test will fail until we implement the actual function
    // This is intentional for TDD RED phase
    const result = await authenticateWithOAuth(token, headers)
    
    expect(result).toBeDefined()
    expect(result.workspaceID).toBeDefined()
    expect(result.workspaceID).toMatch(/^wrk_/)
    expect(result.billing).toBeDefined()
    expect(result.billing.balance).toBeDefined()
    expect(result.user).toBeDefined()
    expect(result.user.id).toBeDefined()
    expect(result.user.id).toMatch(/^usr_/)
  })

  test("creates new workspace for new OAuth user", async () => {
    const token = "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJuZXd1c2VyMTIzIiwibmFtZSI6IkphbmUgU21pdGgiLCJlbWFpbCI6ImphbmVAbmV3ZG9tYWluLmNvbSIsImV4cCI6OTk5OTk5OTk5OX0.signature"
    const headers = new Headers({
      "grpc-metadata-x-project-name": "stitch",
      "grpc-metadata-x-project-auth-key": "stitch_prod_dorp_x7plq9"
    })
    
    const result = await authenticateWithOAuth(token, headers)
    
    expect(result).toBeDefined()
    expect(result.workspaceID).toBeDefined()
    expect(result.user).toBeDefined()
    expect(result.billing).toBeDefined()
  })

  test("throws error for expired OAuth token", async () => {
    // Token with past expiry (exp: 1000000000 = Sep 2001)
    const token = "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjMiLCJuYW1lIjoiSm9obiBEb2UiLCJlbWFpbCI6ImpvaG5AZXhhbXBsZS5jb20iLCJleHAiOjEwMDAwMDAwMDB9.signature"
    const headers = new Headers({
      "grpc-metadata-x-project-name": "stitch"
    })
    
    await expect(authenticateWithOAuth(token, headers)).rejects.toThrow()
  })

  test("throws error for invalid OAuth token format", async () => {
    const token = "not.a.valid.jwt"
    const headers = new Headers()
    
    await expect(authenticateWithOAuth(token, headers)).rejects.toThrow()
  })

  test("returns isFree as false for OAuth users", async () => {
    const token = "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiZW1haWwiOiJqb2huQGV4YW1wbGUuY29tIiwiZXhwIjo5OTk5OTk5OTk5fQ.signature"
    const headers = new Headers({
      "grpc-metadata-x-project-name": "stitch"
    })
    
    const result = await authenticateWithOAuth(token, headers)
    
    expect(result.isFree).toBe(false)
  })

  test("returns isDisabled as false for OAuth users", async () => {
    const token = "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiZW1haWwiOiJqb2huQGV4YW1wbGUuY29tIiwiZXhwIjo5OTk5OTk5OTk5fQ.signature"
    const headers = new Headers({
      "grpc-metadata-x-project-name": "stitch"
    })
    
    const result = await authenticateWithOAuth(token, headers)
    
    expect(result.isDisabled).toBe(false)
  })

  test("sets default billing balance to 0 for new OAuth users", async () => {
    const token = "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJuZXd1c2VyNzg5IiwibmFtZSI6IkFsaWNlIFRlc3QiLCJlbWFpbCI6ImFsaWNlQHRlc3QuY29tIiwiZXhwIjo5OTk5OTk5OTk5fQ.signature"
    const headers = new Headers({
      "grpc-metadata-x-project-name": "stitch"
    })
    
    const result = await authenticateWithOAuth(token, headers)
    
    expect(result.billing.balance).toBe(0)
  })

  test("uses email as workspace identifier", async () => {
    const token = "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyMTIzIiwibmFtZSI6IkJvYiBUZXN0ZXIiLCJlbWFpbCI6ImJvYkBleGFtcGxlLmNvbSIsImV4cCI6OTk5OTk5OTk5OX0.signature"
    const headers = new Headers({
      "grpc-metadata-x-project-name": "stitch"
    })
    
    const result = await authenticateWithOAuth(token, headers)
    
    // Workspace should be created with email-based identification
    expect(result.workspaceID).toBeDefined()
    expect(result.user.email).toBe("bob@example.com")
  })

  test("returns null for apiKeyId (OAuth doesn't use API keys)", async () => {
    const token = "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiZW1haWwiOiJqb2huQGV4YW1wbGUuY29tIiwiZXhwIjo5OTk5OTk5OTk5fQ.signature"
    const headers = new Headers({
      "grpc-metadata-x-project-name": "stitch"
    })
    
    const result = await authenticateWithOAuth(token, headers)
    
    expect(result.apiKeyId).toBeNull()
  })

  test("stores OAuth user info in user record", async () => {
    const token = "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyNzg5IiwibmFtZSI6IkNhcm9sIFdpbHNvbiIsImVtYWlsIjoiY2Fyb2xAZXhhbXBsZS5jb20iLCJleHAiOjk5OTk5OTk5OTl9.signature"
    const headers = new Headers({
      "grpc-metadata-x-project-name": "stitch"
    })
    
    const result = await authenticateWithOAuth(token, headers)
    
    expect(result.user.email).toBe("carol@example.com")
    // Name should be stored if available
  })
})
