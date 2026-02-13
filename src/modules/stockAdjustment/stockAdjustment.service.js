"use strict";

const ExcelJS = require("exceljs");
const db = require("../../models/index.js");
const { Op } = require("sequelize");
const { ADJUSTMENT_STATUS, ADJUSTMENT_TYPE, TRANSACTION_TYPE, MOVEMENT_TYPE, SERIAL_STATUS } = require("../../common/utils/constants.js");
const stockService = require("../stock/stock.service.js");
const inventoryLedgerService = require("../inventoryLedger/inventoryLedger.service.js");

const { StockAdjustment, StockAdjustmentItem, StockAdjustmentSerial, Stock, StockSerial, Product, CompanyWarehouse, User } = db;

const listStockAdjustments = async ({
  page = 1,
  limit = 20,
  status = null,
  adjustment_type = null,
  sortBy = "id",
  sortOrder = "DESC",
  adjustment_number: adjustmentNumber = null,
  adjustment_date_from: adjustmentDateFrom = null,
  adjustment_date_to: adjustmentDateTo = null,
  warehouse_name: warehouseName = null,
  total_quantity,
  total_quantity_op,
  total_quantity_to,
  reason = null,
} = {}) => {
  const offset = (page - 1) * limit;
  const where = { deleted_at: null };

  if (status) where.status = status;
  if (adjustment_type) where.adjustment_type = adjustment_type;
  if (adjustmentNumber) where.adjustment_number = { [Op.iLike]: `%${adjustmentNumber}%` };
  if (reason) where.reason = { [Op.iLike]: `%${reason}%` };
  if (adjustmentDateFrom || adjustmentDateTo) {
    const dateCond = {};
    if (adjustmentDateFrom) dateCond[Op.gte] = adjustmentDateFrom;
    if (adjustmentDateTo) dateCond[Op.lte] = adjustmentDateTo;
    if (Reflect.ownKeys(dateCond).length) where.adjustment_date = dateCond;
  }
  if (total_quantity || total_quantity_to) {
    const v = parseFloat(total_quantity);
    const vTo = parseFloat(total_quantity_to);
    if (!Number.isNaN(v) || !Number.isNaN(vTo)) {
      const cond = {};
      const op = (total_quantity_op || "").toLowerCase();
      if (op === "between" && !Number.isNaN(v) && !Number.isNaN(vTo)) cond[Op.between] = [v, vTo];
      else if (op === "gt" && !Number.isNaN(v)) cond[Op.gt] = v;
      else if (op === "lt" && !Number.isNaN(v)) cond[Op.lt] = v;
      else if (op === "gte" && !Number.isNaN(v)) cond[Op.gte] = v;
      else if (op === "lte" && !Number.isNaN(v)) cond[Op.lte] = v;
      else if (!Number.isNaN(v)) cond[Op.eq] = v;
      if (Reflect.ownKeys(cond).length > 0) where.total_quantity = cond;
    }
  }

  const warehouseInclude = {
    model: CompanyWarehouse,
    as: "warehouse",
    attributes: ["id", "name"],
    required: !!warehouseName,
    ...(warehouseName && { where: { name: { [Op.iLike]: `%${warehouseName}%` } } }),
  };

  const { count, rows } = await StockAdjustment.findAndCountAll({
    where,
    include: [
      warehouseInclude,
      { model: User, as: "requestedBy", attributes: ["id", "name", "email"] },
      { model: User, as: "approvedBy", attributes: ["id", "name", "email"] },
    ],
    order: [[sortBy, sortOrder]],
    limit,
    offset,
    distinct: true,
  });

  return {
    data: rows.map((row) => row.toJSON()),
    meta: { page, limit, total: count, pages: limit > 0 ? Math.ceil(count / limit) : 0 },
  };
};

const exportStockAdjustments = async (params = {}) => {
  const { data } = await listStockAdjustments({ ...params, page: 1, limit: 10000 });

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Stock Adjustments");
  worksheet.columns = [
    { header: "Adjustment Number", key: "adjustment_number", width: 20 },
    { header: "Adjustment Date", key: "adjustment_date", width: 14 },
    { header: "Warehouse", key: "warehouse_name", width: 22 },
    { header: "Type", key: "adjustment_type", width: 14 },
    { header: "Status", key: "status", width: 12 },
    { header: "Total Qty", key: "total_quantity", width: 12 },
    { header: "Reason", key: "reason", width: 28 },
    { header: "Created At", key: "created_at", width: 22 },
  ];
  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E0E0" } };
  (data || []).forEach((a) => {
    worksheet.addRow({
      adjustment_number: a.adjustment_number || "",
      adjustment_date: a.adjustment_date ? new Date(a.adjustment_date).toISOString().split("T")[0] : "",
      warehouse_name: a.warehouse?.name || "",
      adjustment_type: a.adjustment_type || "",
      status: a.status || "",
      total_quantity: a.total_quantity != null ? a.total_quantity : "",
      reason: a.reason || "",
      created_at: a.created_at ? new Date(a.created_at).toISOString() : "",
    });
  });
  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
};

const getStockAdjustmentById = async ({ id } = {}) => {
  if (!id) return null;

  const adjustment = await StockAdjustment.findOne({
    where: { id, deleted_at: null },
    include: [
      { model: CompanyWarehouse, as: "warehouse", attributes: ["id", "name", "address"] },
      { model: User, as: "requestedBy", attributes: ["id", "name", "email"] },
      { model: User, as: "approvedBy", attributes: ["id", "name", "email"] },
      {
        model: StockAdjustmentItem,
        as: "items",
        include: [
          { model: Product, as: "product", attributes: ["id", "product_name", "tracking_type", "serial_required"] },
          {
            model: StockAdjustmentSerial,
            as: "serials",
            include: [{ model: StockSerial, as: "stockSerial", attributes: ["id", "serial_number", "status"] }],
          },
        ],
      },
    ],
  });

  return adjustment ? adjustment.toJSON() : null;
};

const createStockAdjustment = async ({ payload, transaction } = {}) => {
  const t = transaction || (await db.sequelize.transaction());
  let committedHere = !transaction;

  try {
    const { items, ...adjustmentData } = payload;

    if (!items || items.length === 0) {
      throw new Error("Stock adjustment must have at least one item");
    }

    // Determine direction based on adjustment type
    const getDirection = (type) => {
      if (type === ADJUSTMENT_TYPE.FOUND) return MOVEMENT_TYPE.IN;
      if (type === ADJUSTMENT_TYPE.DAMAGE || type === ADJUSTMENT_TYPE.LOSS) return MOVEMENT_TYPE.OUT;
      return null; // AUDIT can be either
    };

    const defaultDirection = getDirection(adjustmentData.adjustment_type);

    const created = await StockAdjustment.create(
      {
        adjustment_date: adjustmentData.adjustment_date,
        warehouse_id: adjustmentData.warehouse_id,
        adjustment_type: adjustmentData.adjustment_type,
        status: ADJUSTMENT_STATUS.DRAFT,
        remarks: adjustmentData.remarks || null,
        requested_by: adjustmentData.requested_by,
      },
      { transaction: t }
    );

    for (const item of items) {
      const product = await Product.findByPk(item.product_id, { transaction: t });
      if (!product) {
        throw new Error(`Product with id ${item.product_id} not found`);
      }

      const direction = item.adjustment_direction || defaultDirection;
      if (!direction) {
        throw new Error("Adjustment direction must be specified for AUDIT type");
      }

      // Validate serial count if required
      if (product.serial_required && item.serials) {
        if (item.serials.length !== item.adjustment_quantity) {
          throw new Error(`Serial count (${item.serials.length}) must match adjustment quantity (${item.adjustment_quantity})`);
        }
      }

      const adjustmentItem = await StockAdjustmentItem.create(
        {
          stock_adjustment_id: created.id,
          product_id: item.product_id,
          tracking_type: product.tracking_type === "SERIAL" ? "SERIAL" : "NONE",
          serial_required: product.serial_required,
          adjustment_quantity: item.adjustment_quantity,
          adjustment_direction: direction,
          reason: item.reason || null,
        },
        { transaction: t }
      );

      if (item.serials && item.serials.length > 0) {
        for (const serial of item.serials) {
          await StockAdjustmentSerial.create(
            {
              stock_adjustment_item_id: adjustmentItem.id,
              stock_serial_id: serial.stock_serial_id,
            },
            { transaction: t }
          );
        }
      }
    }

    if (committedHere) {
      await t.commit();
    }

    return created.toJSON();
  } catch (err) {
    if (committedHere) {
      await t.rollback();
    }
    throw err;
  }
};

const approveStockAdjustment = async ({ id, approved_by, transaction } = {}) => {
  if (!id) return null;

  const t = transaction || (await db.sequelize.transaction());
  let committedHere = !transaction;

  try {
    const adjustment = await StockAdjustment.findOne({
      where: { id, deleted_at: null },
      include: [
        {
          model: StockAdjustmentItem,
          as: "items",
          include: [
            { model: Product, as: "product" },
            {
              model: StockAdjustmentSerial,
              as: "serials",
              include: [{ model: StockSerial, as: "stockSerial" }],
            },
          ],
        },
      ],
      transaction: t,
    });

    if (!adjustment) throw new Error("Stock adjustment not found");
    if (adjustment.status !== ADJUSTMENT_STATUS.DRAFT) {
      throw new Error(`Stock adjustment is already ${adjustment.status}`);
    }

    await adjustment.update(
      {
        status: ADJUSTMENT_STATUS.APPROVED,
        approved_by,
        approved_at: new Date(),
      },
      { transaction: t }
    );

    if (committedHere) {
      await t.commit();
    }

    return adjustment.toJSON();
  } catch (err) {
    if (committedHere) {
      await t.rollback();
    }
    throw err;
  }
};

const postStockAdjustment = async ({ id, transaction } = {}) => {
  if (!id) return null;

  const t = transaction || (await db.sequelize.transaction());
  let committedHere = !transaction;

  try {
    const adjustment = await StockAdjustment.findOne({
      where: { id, deleted_at: null },
      include: [
        {
          model: StockAdjustmentItem,
          as: "items",
          include: [
            { model: Product, as: "product" },
            {
              model: StockAdjustmentSerial,
              as: "serials",
              include: [{ model: StockSerial, as: "stockSerial" }],
            },
          ],
        },
      ],
      transaction: t,
    });

    if (!adjustment) throw new Error("Stock adjustment not found");
    if (adjustment.status !== ADJUSTMENT_STATUS.APPROVED) {
      throw new Error(`Stock adjustment must be APPROVED to post. Current status: ${adjustment.status}`);
    }

    // Process each item
    for (const item of adjustment.items) {
      const stock = await stockService.getOrCreateStock({
        product_id: item.product_id,
        warehouse_id: adjustment.warehouse_id,
        product: item.product,
        transaction: t,
      });

      // Validate for OUT adjustments
      if (item.adjustment_direction === MOVEMENT_TYPE.OUT) {
        if (stock.quantity_available < item.adjustment_quantity) {
          throw new Error(`Insufficient stock for product ${item.product.product_name}. Available: ${stock.quantity_available}, Required: ${item.adjustment_quantity}`);
        }

        // Validate serials if required
        if (item.serial_required && item.serials) {
          for (const serial of item.serials) {
            const stockSerial = serial.stockSerial;
            if (stockSerial.warehouse_id !== adjustment.warehouse_id) {
              throw new Error(`Serial ${stockSerial.serial_number} does not belong to this warehouse`);
            }
            if (stockSerial.status !== SERIAL_STATUS.AVAILABLE) {
              throw new Error(`Serial ${stockSerial.serial_number} is not available`);
            }
          }
        }
      }

      // Update stock quantities
      await stockService.updateStockQuantities({
        stock,
        quantity: item.adjustment_quantity,
        last_updated_by: adjustment.approved_by || adjustment.requested_by,
        isInward: item.adjustment_direction === MOVEMENT_TYPE.IN,
        transaction: t,
      });

      // Handle serials
      if (item.serials && item.serials.length > 0) {
        for (const serial of item.serials) {
          const stockSerial = serial.stockSerial;

          if (item.adjustment_direction === MOVEMENT_TYPE.OUT) {
            // Mark as BLOCKED for damage/loss
            if (stockSerial) {
              await stockSerial.update(
                {
                  status: SERIAL_STATUS.BLOCKED,
                  outward_date: new Date(),
                },
                { transaction: t }
              );
            }
          } else if (item.adjustment_direction === MOVEMENT_TYPE.IN) {
            // For FOUND items, if serial doesn't exist, we need serial number from adjustment
            // Note: For FOUND items with serials, the serial should be provided in the adjustment
            // and we'll create it if it doesn't exist. This requires serial_number to be stored
            // in the adjustment serial record, which we'll handle at creation time.
            if (stockSerial) {
              // Serial exists, just ensure it's available
              if (stockSerial.status !== SERIAL_STATUS.AVAILABLE) {
                await stockSerial.update(
                  {
                    status: SERIAL_STATUS.AVAILABLE,
                    warehouse_id: adjustment.warehouse_id,
                    stock_id: stock.id,
                  },
                  { transaction: t }
                );
              }
            }
            // If serial doesn't exist, it should have been created during adjustment creation
            // with the serial_number. For now, we assume serials are linked to existing stock_serials.
          }
        }
      }

      // Create ledger entry
      await inventoryLedgerService.createLedgerEntry({
        product_id: item.product_id,
        warehouse_id: adjustment.warehouse_id,
        stock_id: stock.id,
        transaction_type: TRANSACTION_TYPE.STOCK_ADJUSTMENT,
        transaction_id: adjustment.id,
        movement_type: item.adjustment_direction,
        quantity: item.adjustment_quantity,
        reason: item.reason || `${adjustment.adjustment_type} adjustment`,
        performed_by: adjustment.approved_by || adjustment.requested_by,
        transaction: t,
      });
    }

    // Update status to POSTED
    await adjustment.update(
      {
        status: ADJUSTMENT_STATUS.POSTED,
      },
      { transaction: t }
    );

    if (committedHere) {
      await t.commit();
    }

    return adjustment.toJSON();
  } catch (err) {
    if (committedHere) {
      await t.rollback();
    }
    throw err;
  }
};

module.exports = {
  listStockAdjustments,
  getStockAdjustmentById,
  createStockAdjustment,
  approveStockAdjustment,
  postStockAdjustment,
};

