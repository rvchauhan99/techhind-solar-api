"use strict";

const { asyncHandler } = require("../../../common/utils/asyncHandler.js");
const responseHandler = require("../../../common/utils/responseHandler.js");
const deliveryReportService = require("./deliveryReport.service.js");

const list = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 20,
    start_date = null,
    end_date = null,
    warehouse_id = null,
    order_number = null,
  } = req.query;

  const result = await deliveryReportService.getDeliveryReport({
    page: parseInt(page, 10),
    limit: parseInt(limit, 10),
    start_date,
    end_date,
    warehouse_id: warehouse_id ? parseInt(warehouse_id, 10) : null,
    order_number,
  });

  return responseHandler.sendSuccess(res, result, "Delivery report fetched", 200);
});

module.exports = {
  list,
};

