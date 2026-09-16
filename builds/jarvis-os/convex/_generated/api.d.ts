/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as aiMessages from "../aiMessages.js";
import type * as aiSessions from "../aiSessions.js";
import type * as audit from "../audit.js";
import type * as chatRooms from "../chatRooms.js";
import type * as devices from "../devices.js";
import type * as documents from "../documents.js";
import type * as lib_auth from "../lib/auth.js";
import type * as messages from "../messages.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  aiMessages: typeof aiMessages;
  aiSessions: typeof aiSessions;
  audit: typeof audit;
  chatRooms: typeof chatRooms;
  devices: typeof devices;
  documents: typeof documents;
  "lib/auth": typeof lib_auth;
  messages: typeof messages;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
