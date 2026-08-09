/**
 * ============================================================
 * ShadowDev Backend
 * Standard API Response Helper
 * ============================================================
 *
 * Node.js + Express
 *
 * IMPORTANT:
 *
 * This utility no longer uses the Cloudflare Worker
 * Response.json() API.
 *
 * It returns plain response data that Express routes can
 * send using res.status(...).json(...).
 *
 * ============================================================
 */


/**
 * ============================================================
 * Build Success Response
 * ============================================================
 */

export function successResponse(
  data = null,
  message = "Success.",
  status = 200
) {

  return {

      status,

      body: {

          success:
              true,

          message,

          data,

          timestamp:
              new Date().toISOString()

      }

  };

}


/**
* ============================================================
* Build Error Response
* ============================================================
*/

export function errorResponse(
  message = "Something went wrong.",
  status = 500,
  errors = null
) {

  return {

      status,

      body: {

          success:
              false,

          message,

          errors,

          timestamp:
              new Date().toISOString()

      }

  };

}


/**
* ============================================================
* Validation Error
* ============================================================
*/

export function validationError(
  errors = []
) {

  return {

      status:
          422,

      body: {

          success:
              false,

          message:
              "Validation failed.",

          errors,

          timestamp:
              new Date().toISOString()

      }

  };

}


/**
* ============================================================
* Unauthorized Response
* ============================================================
*/

export function unauthorizedResponse(
  message = "Unauthorized."
) {

  return {

      status:
          401,

      body: {

          success:
              false,

          message,

          timestamp:
              new Date().toISOString()

      }

  };

}


/**
* ============================================================
* Forbidden Response
* ============================================================
*/

export function forbiddenResponse(
  message = "Forbidden."
) {

  return {

      status:
          403,

      body: {

          success:
              false,

          message,

          timestamp:
              new Date().toISOString()

      }

  };

}


/**
* ============================================================
* Not Found Response
* ============================================================
*/

export function notFoundResponse(
  message = "Not Found."
) {

  return {

      status:
          404,

      body: {

          success:
              false,

          message,

          timestamp:
              new Date().toISOString()

      }

  };

}


/**
* ============================================================
* Send API Response
* ============================================================
*
* This helper allows migrated routes to use:
*
*     return sendResponse(
*         res,
*         successResponse(...)
*     );
*
* ============================================================
*/

export function sendResponse(
  res,
  response
) {

  /**
   * --------------------------------------------------------
   * Safety Check
   * --------------------------------------------------------
   */

  if (
      !res ||
      typeof res.status !== "function" ||
      typeof res.json !== "function"
  ) {

      throw new TypeError(
          "A valid Express response object is required."
      );

  }


  /**
   * --------------------------------------------------------
   * Safety Check For Response Object
   * --------------------------------------------------------
   */

  if (
      !response ||
      typeof response !== "object"
  ) {

      throw new TypeError(
          "Invalid API response object."
      );

  }


  const status =
      Number.isInteger(
          response.status
      )
          ? response.status
          : 200;


  const body =
      response.body &&
      typeof response.body === "object"
          ? response.body
          : {

              success:
                  false,

              message:
                  "Invalid API response.",

              timestamp:
                  new Date().toISOString()

          };


  /**
   * --------------------------------------------------------
   * Express Response
   * --------------------------------------------------------
   */

  return res
      .status(status)
      .json(body);

}


/**
* ============================================================
* Convenience Helpers
* ============================================================
*
* These are useful when a route wants to directly send an
* Express response without manually calling sendResponse().
*
* ============================================================
*/


/**
* ------------------------------------------------------------
* Send Success
* ------------------------------------------------------------
*/

export function sendSuccess(
  res,
  data = null,
  message = "Success.",
  status = 200
) {

  return res
      .status(status)
      .json({

          success:
              true,

          message,

          data,

          timestamp:
              new Date().toISOString()

      });

}


/**
* ------------------------------------------------------------
* Send Error
* ------------------------------------------------------------
*/

export function sendError(
  res,
  message = "Something went wrong.",
  status = 500,
  errors = null
) {

  return res
      .status(status)
      .json({

          success:
              false,

          message,

          errors,

          timestamp:
              new Date().toISOString()

      });

}


/**
* ============================================================
* Default Export
* ============================================================
*/

export default {

  successResponse,

  errorResponse,

  validationError,

  unauthorizedResponse,

  forbiddenResponse,

  notFoundResponse,

  sendResponse,

  sendSuccess,

  sendError

};