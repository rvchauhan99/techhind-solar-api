"use strict";

const { asyncHandler } = require("../../common/utils/asyncHandler.js");
const responseHandler = require("../../common/utils/responseHandler.js");
const { RESPONSE_STATUS_CODES } = require("../../common/utils/constants.js");
const globalSearchService = require("./globalSearch.service.js");

const search = asyncHandler(async (req, res) => {
  const { q, per_module_limit, max_total } = req.query;
  try {
    const result = await globalSearchService.runGlobalSearch(req, {
      q,
      per_module_limit,
      max_total,
    });
    return responseHandler.sendSuccess(res, result, "Global search results", 200);
  } catch (err) {
    if (err.statusCode === 400) {
      return responseHandler.sendError(res, err.message, RESPONSE_STATUS_CODES.BAD_REQUEST);
    }
    throw err;
  }
});

module.exports = {
  search,
};
