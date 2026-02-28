/**
 * Stitch OAuth Authentication Handler
 * 
 * Handles OAuth authentication from Stitch-CLI by validating JWT tokens
 * and managing workspace/user/billing records for OAuth users.
 */

import { Database, eq, and } from "@opencode-ai/console-core/drizzle/index.js"
import { WorkspaceTable } from "@opencode-ai/console-core/schema/workspace.sql.js"
import { UserTable } from "@opencode-ai/console-core/schema/user.sql.js"
import { BillingTable } from "@opencode-ai/console-core/schema/billing.sql.js"
import { Identifier } from "@opencode-ai/console-core/identifier.js"
import { validateAndExtractUser } from "./oauth-validator"
import { AuthError } from "./error"

/**
 * Parse Stitch-specific headers from the request
 */
export function parseStitchHeaders(headers: Headers): {
  projectName?: string
  authKey?: string
} {
  return {
    projectName: headers.get("grpc-metadata-x-project-name") ?? undefined,
    authKey: headers.get("grpc-metadata-x-project-auth-key") ?? undefined
  }
}

/**
 * Type for the auth context returned by authentication
 * Must match the format returned by the API key authentication
 */
export interface OAuthAuthContext {
  apiKeyId: string | null
  workspaceID: string
  billing: {
    balance: number
    paymentMethodID: string | null
    monthlyLimit: number | null
    monthlyUsage: number | null
    timeMonthlyUsageUpdated: Date | null
    reloadTrigger: number | null
    timeReloadLockedTill: Date | null
    subscription: any | null
    lite: any | null
  }
  user: {
    id: string
    monthlyLimit: number | null
    monthlyUsage: number | null
    timeMonthlyUsageUpdated: Date | null
    email: string | null
  }
  black: any | null
  lite: any | null
  provider: any | null
  isFree: boolean
  isDisabled: boolean
}

/**
 * Authenticate a user with OAuth JWT token
 * Creates workspace/user/billing if they don't exist
 */
export async function authenticateWithOAuth(
  token: string,
  headers: Headers
): Promise<OAuthAuthContext> {
  // Validate and extract user info from JWT
  const validation = validateAndExtractUser(token)
  
  if (!validation.valid) {
    throw new AuthError(`OAuth validation failed: ${validation.error}`)
  }
  
  const { userId, email, name } = validation
  
  if (!email) {
    throw new AuthError("OAuth token missing required email claim")
  }
  
  // Parse Stitch headers (optional metadata)
  const stitchHeaders = parseStitchHeaders(headers)
  
  // Look up or create workspace/user/billing for this OAuth user
  const authContext = await Database.use(async (tx) => {
    // First, try to find existing user by email (globally)
    const existingUser = await tx
      .select({
        workspaceID: UserTable.workspaceID,
        userId: UserTable.id,
        email: UserTable.email,
        name: UserTable.name,
        monthlyLimit: UserTable.monthlyLimit,
        monthlyUsage: UserTable.monthlyUsage,
        timeMonthlyUsageUpdated: UserTable.timeMonthlyUsageUpdated,
      })
      .from(UserTable)
      .where(eq(UserTable.email, email))
      .then((rows) => rows[0])
    
    let workspaceID: string
    let user: {
      id: string
      email: string | null
      monthlyLimit: number | null
      monthlyUsage: number | null
      timeMonthlyUsageUpdated: Date | null
    }
    
    if (existingUser) {
      // User already exists, use their workspace
      workspaceID = existingUser.workspaceID
      user = {
        id: existingUser.userId,
        email: existingUser.email,
        monthlyLimit: existingUser.monthlyLimit,
        monthlyUsage: existingUser.monthlyUsage,
        timeMonthlyUsageUpdated: existingUser.timeMonthlyUsageUpdated,
      }
    } else {
      // Create new workspace for this OAuth user
      workspaceID = Identifier.create("workspace")
      const userID = Identifier.create("user")
      
      // Create workspace
      await tx.insert(WorkspaceTable).values({
        id: workspaceID,
        name: name || email, // Use name or fallback to email
        slug: null,
        timeCreated: new Date(),
        timeUpdated: new Date(),
        timeDeleted: null,
      })
      
      // Create user
      await tx.insert(UserTable).values({
        workspaceID,
        id: userID,
        accountID: userId, // Store OAuth userId as accountID
        email,
        name: name || email,
        role: "admin", // OAuth users are admins of their workspace
        color: null,
        timeSeen: new Date(),
        monthlyLimit: null,
        monthlyUsage: null,
        timeMonthlyUsageUpdated: null,
        timeCreated: new Date(),
        timeUpdated: new Date(),
        timeDeleted: null,
      })
      
      // Create billing record with default values
      await tx.insert(BillingTable).values({
        workspaceID,
        id: Identifier.create("billing"),
        customerID: null,
        paymentMethodID: null,
        paymentMethodType: null,
        paymentMethodLast4: null,
        balance: 0, // Start with 0 balance
        monthlyLimit: null,
        monthlyUsage: null,
        timeMonthlyUsageUpdated: null,
        reload: null,
        reloadTrigger: null,
        reloadAmount: null,
        reloadError: null,
        timeReloadError: null,
        timeReloadLockedTill: null,
        subscription: null,
        subscriptionID: null,
        subscriptionPlan: null,
        timeSubscriptionBooked: null,
        timeSubscriptionSelected: null,
        liteSubscriptionID: null,
        lite: null,
        timeCreated: new Date(),
        timeUpdated: new Date(),
        timeDeleted: null,
      })
      
      user = {
        id: userID,
        email,
        monthlyLimit: null,
        monthlyUsage: null,
        timeMonthlyUsageUpdated: null,
      }
    }
    
    // Fetch billing info
    const billing = await tx
      .select({
        balance: BillingTable.balance,
        paymentMethodID: BillingTable.paymentMethodID,
        monthlyLimit: BillingTable.monthlyLimit,
        monthlyUsage: BillingTable.monthlyUsage,
        timeMonthlyUsageUpdated: BillingTable.timeMonthlyUsageUpdated,
        reloadTrigger: BillingTable.reloadTrigger,
        timeReloadLockedTill: BillingTable.timeReloadLockedTill,
        subscription: BillingTable.subscription,
        lite: BillingTable.lite,
      })
      .from(BillingTable)
      .where(eq(BillingTable.workspaceID, workspaceID))
      .then((rows) => rows[0])
    
    if (!billing) {
      throw new AuthError("Failed to create or retrieve billing information")
    }
    
    return {
      workspaceID,
      user,
      billing,
    }
  })
  
  // Return auth context in the same format as API key authentication
  return {
    apiKeyId: null, // OAuth doesn't use API keys
    workspaceID: authContext.workspaceID,
    billing: authContext.billing,
    user: authContext.user,
    black: null, // OAuth users don't have black subscription initially
    lite: null, // OAuth users don't have lite subscription initially
    provider: null, // OAuth users don't have BYOK providers
    isFree: false, // OAuth users are not in the free tier
    isDisabled: false, // OAuth users are never disabled
  }
}
