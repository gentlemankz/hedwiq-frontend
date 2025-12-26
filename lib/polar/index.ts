export {
  // Types
  type SubscriptionTier,
  type BillingInterval,
  type PolarProduct,
  type TierLimits,
  type MeterSlug,
  type MeterType,
  // Constants
  POLAR_PRODUCTS,
  POLAR_CHECKOUT_PRODUCTS,
  VALID_PRODUCT_SLUGS,
  TIER_LIMITS,
  UNLIMITED,
  UNLIMITED_THRESHOLD,
  PAST_DUE_GRACE_DAYS,
  METER_SLUGS,
  // Functions
  isUnlimited,
  isUnlimitedMinutes,
  getTierFromProductId,
  getIntervalFromProductId,
  getProductBySlug,
  isValidProductSlug,
  getLimitsForTier,
  isPastDueWithinGrace,
  identifyMeterType,
} from "./constants";

// Usage tracking exports
export {
  // Types
  type UsageReport,
  type MeetingLimitCheck,
  type CustomerState,
  type PolarCustomerResult,
  // Constants
  USAGE_EVENTS,
  // Functions
  getPolarCustomer,
  getOrCreatePolarCustomer,
  reportMeetingMinutes,
  reportEmailDraft,
  reportStorageChange,
  getCustomerState,
  canUserStartMeeting,
  canUserCreateEmailDraft,
} from "./usage";

// Checkout utilities exports
export {
  // Types
  type PendingCheckout,
  // Constants
  PENDING_CHECKOUT_KEY,
  // Functions
  buildCheckoutSlug,
  storePendingCheckout,
  consumePendingCheckout,
  hasPendingCheckout,
  clearPendingCheckout,
} from "./checkout";

// Auth flow utilities exports
export {
  handlePostAuthCheckout,
  formatPlanName,
  buildOAuthCallbackURL,
} from "./auth-flow";

// Subscription cache exports
export {
  type CachedSubscription,
  type CacheUpdateInput,
  CACHE_FRESHNESS_MINUTES,
  CACHE_MAX_AGE_HOURS,
  getSubscriptionFromCache,
  updateSubscriptionCache,
  isCacheTooOld,
  recordCacheSyncError,
  deleteSubscriptionCache,
} from "./subscription-cache";
