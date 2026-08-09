/**
 * ============================================================
 * ShadowDev Backend
 * Global Constants
 * ============================================================
 *
 * Shared configuration values used across the backend.
 *
 * Node.js + Express compatible.
 *
 * ============================================================
 */


/**
 * ============================================================
 * Application
 * ============================================================
 */

export const APP = Object.freeze({

  NAME:
      "ShadowDev",

  VERSION:
      "1.0.0"

});


/**
* ============================================================
* Ticket
* ============================================================
*/

export const TICKET = Object.freeze({

  PREFIX:
      "SD",

  ID_LENGTH:
      6,

  STATUS:
      Object.freeze({

          OPEN:
              "open",

          PENDING:
              "pending",

          CLOSED:
              "closed"

      })

});


/**
* ============================================================
* User Message Limits
* ============================================================
*/

export const MESSAGE = Object.freeze({

  MIN_LENGTH:
      5,

  MAX_LENGTH:
      2000

});


/**
* ============================================================
* Allowed Services
* ============================================================
*/

export const SERVICES = Object.freeze([

  "Web Development",

  "Landing Page",

  "E-Commerce Store",

  "Custom Web App",

  "Admin Dashboard",

  "UI/UX Design",

  "Bug Fix",

  "Website Redesign",

  "Other"

]);


/**
* ============================================================
* Rate Limiting
* ============================================================
*
* WINDOW_MS:
*     Rate-limit window in milliseconds.
*
* MAX_REQUESTS:
*     Maximum requests allowed inside the window.
*
* ============================================================
*/

export const RATE_LIMIT = Object.freeze({

  WINDOW_MS:
      1000,

  MAX_REQUESTS:
      5

});


/**
* ============================================================
* JWT
* ============================================================
*/

export const JWT = Object.freeze({

  EXPIRES_IN:
      "7d"

});


/**
* ============================================================
* Pagination
* ============================================================
*/

export const PAGINATION = Object.freeze({

  DEFAULT_PAGE:
      1,

  DEFAULT_LIMIT:
      20,

  MAX_LIMIT:
      100

});


/**
* ============================================================
* Default API Response Messages
* ============================================================
*/

export const RESPONSE = Object.freeze({

  SUCCESS:
      "Success.",

  INTERNAL_ERROR:
      "Internal server error.",

  INVALID_SERVICE:
      "Invalid service selected.",

  INVALID_MESSAGE:
      "Invalid message.",

  INVALID_TICKET:
      "Invalid ticket ID.",

  TICKET_NOT_FOUND:
      "Ticket not found.",

  LOGIN_SUCCESS:
      "Login successful.",

  LOGIN_FAILED:
      "Invalid username or password."

});