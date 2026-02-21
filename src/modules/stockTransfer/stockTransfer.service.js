"use strict";

const ExcelJS = require("exceljs");
const { Op } = require("sequelize");
const { TRANSFER_STATUS, TRANSACTION_TYPE, MOVEMENT_TYPE, SERIAL_STATUS } = require("../../common/utils/constants.js");
const stockService = require("../stock/stock.service.js");
const inventoryLedgerService = require("../inventoryLedger/inventoryLedger.service.js");
const { getTenantModels } = require("../tenant/tenantModels.js");

const listStockTransfers = async ({
  page = 1,
  limit = 20,
  status = null,
  sortBy = "id",
  sortOrder = "DESC",
  transfer_number: transferNumber = null,
  transfer_date_from: transferDateFrom = null,
  transfer_date_to: transferDateTo = null,
  from_warehouse_name: fromWarehouseName = null,
  to_warehouse_name: toWarehouseName = null,
} = {}) => {
  const models = getTenantModels();
  const { StockTransfer, CompanyWarehouse, User } = models;
  const offset = (page - 1) * limit;
  const where = { deleted_at: null };

  if (status) where.status = status;
  if (transferNumber) {
    where.transfer_number = { [Op.iLike]: `%${transferNumber}%` };
  }
  if (transferDateFrom || transferDateTo) {
    const dateCond = {};
    if (transferDateFrom) dateCond[Op.gte] = transferDateFrom;
    if (transferDateTo) dateCond[Op.lte] = transferDateTo;
    if (Reflect.ownKeys(dateCond).length) where.transfer_date = dateCond;
  }

  const fromWarehouseInclude = {
    model: CompanyWarehouse,
    as: "fromWarehouse",
    attributes: ["id", "name"],
    required: !!fromWarehouseName,
    ...(fromWarehouseName && { where: { name: { [Op.iLike]: `%${fromWarehouseName}%` } } }),
  };
  const toWarehouseInclude = {
    model: CompanyWarehouse,
    as: "toWarehouse",
    attributes: ["id", "name"],
    required: !!toWarehouseName,
    ...(toWarehouseName && { where: { name: { [Op.iLike]: `%${toWarehouseName}%` } } }),
  };

  const { count, rows } = await StockTransfer.findAndCountAll({
    where,
    include: [
      fromWarehouseInclude,
      toWarehouseInclude,
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

const exportStockTransfers = async (params = {}) => {
  const { data } = await listStockTransfers({ ...params, page: 1, limit: 10000 });

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Stock Transfers");
  worksheet.columns = [
    { header: "Transfer Number", key: "transfer_number", width: 20 },
    { header: "Transfer Date", key: "transfer_date", width: 14 },
    { header: "From Warehouse", key: "from_warehouse_name", width: 22 },
    { header: "To Warehouse", key: "to_warehouse_name", width: 22 },
    { header: "Status", key: "status", width: 14 },
    { header: "Total Qty", key: "total_quantity", width: 12 },
    { header: "Remarks", key: "remarks", width: 28 },
    { header: "Created At", key: "created_at", width: 22 },
  ];
  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E0E0" } };
  (data || []).forEach((t) => {
    worksheet.addRow({
      transfer_number: t.transfer_number || "",
      transfer_date: t.transfer_date ? new Date(t.transfer_date).toISOString().split("T")[0] : "",
      from_warehouse_name: t.fromWarehouse?.name || "",
      to_warehouse_name: t.toWarehouse?.name || "",
      status: t.status || "",
      total_quantity: t.total_quantity != null ? t.total_quantity : "",
      remarks: t.remarks || "",
      created_at: t.created_at ? new Date(t.created_at).toISOString() : "",
    });
  });
  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
};

const getStockTransferById = async ({ id } = {}) => {
  if (!id) return null;
  const models = getTenantModels();
  const { StockTransfer, StockTransferItem, StockTransferSerial, StockSerial, Product, CompanyWarehouse, User } = models;
  const transfer = await StockTransfer.findOne({
    where: { id, deleted_at: null },
    include: [
      { model: CompanyWarehouse, as: "fromWarehouse", attributes: ["id", "name", "address"] },
      { model: CompanyWarehouse, as: "toWarehouse", attributes: ["id", "name", "address"] },
      { model: User, as: "requestedBy", attributes: ["id", "name", "email"] },
      { model: User, as: "approvedBy", attributes: ["id", "name", "email"] },
      {
        model: StockTransferItem,
        as: "items",
        include: [
          { model: Product, as: "product", attributes: ["id", "product_name", "tracking_type", "serial_required"] },
          {
            model: StockTransferSerial,
            as: "serials",
            include: [{ model: StockSerial, as: "stockSerial", attributes: ["id", "serial_number", "status"] }],
          },
        ],
      },
    ],
  });

  return transfer ? transfer.toJSON() : null;
};

const createStockTransfer = async ({ payload, transaction } = {}) => {
  const models = getTenantModels();
  const { StockTransfer, StockTransferItem, StockTransferSerial, Product } = models;
  const t = transaction || (await models.sequelize.transaction());
  let committedHere = !transaction;

  try {
    const { items, ...transferData } = payload;

    if (!items || items.length === 0) {
      throw new Error("Stock transfer must have at least one item");
    }

    if (transferData.from_warehouse_id === transferData.to_warehouse_id) {
      throw new Error("Source and destination warehouses cannot be the same");
    }

    const created = await StockTransfer.create(
      {
        transfer_date: transferData.transfer_date,
        from_warehouse_id: transferData.from_warehouse_id,
        to_warehouse_id: transferData.to_warehouse_id,
        status: TRANSFER_STATUS.DRAFT,
        remarks: transferData.remarks || null,
        requested_by: transferData.requested_by,
      },
      { transaction: t }
    );

    for (const item of items) {
      const product = await Product.findByPk(item.product_id, { transaction: t });
      if (!product) {
        throw new Error(`Product with id ${item.product_id} not found`);
      }

      // Validate serial count if required
      if (product.serial_required && item.serials) {
        if (item.serials.length !== item.transfer_quantity) {
          throw new Error(`Serial count (${item.serials.length}) must match transfer quantity (${item.transfer_quantity})`);
        }
      }

      const transferItem = await StockTransferItem.create(
        {
          stock_transfer_id: created.id,
          product_id: item.product_id,
          tracking_type: product.tracking_type === "SERIAL" ? "SERIAL" : "NONE",
          serial_required: product.serial_required,
          transfer_quantity: item.transfer_quantity,
        },
        { transaction: t }
      );

      if (item.serials && item.serials.length > 0) {
        for (const serial of item.serials) {
          await StockTransferSerial.create(
            {
              stock_transfer_item_id: transferItem.id,
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

const updateStockTransfer = async ({ id, payload, transaction } = {}) => {
  if (!id) return null;
  const models = getTenantModels();
  const { StockTransfer, StockTransferItem, StockTransferSerial, Product } = models;
  const t = transaction || (await models.sequelize.transaction());
  let committedHere = !transaction;

  try {
    const transfer = await StockTransfer.findOne({
      where: { id, deleted_at: null },
      transaction: t,
    });

    if (!transfer) throw new Error("Stock transfer not found");
    if (transfer.status !== TRANSFER_STATUS.DRAFT) {
      throw new Error(`Stock transfer is already ${transfer.status} and cannot be updated`);
    }

    const { items, ...transferData } = payload;

    if (!items || items.length === 0) {
      throw new Error("Stock transfer must have at least one item");
    }

    if (transferData.from_warehouse_id === transferData.to_warehouse_id) {
      throw new Error("Source and destination warehouses cannot be the same");
    }

    // Update transfer header
    await transfer.update(
      {
        transfer_date: transferData.transfer_date,
        from_warehouse_id: transferData.from_warehouse_id,
        to_warehouse_id: transferData.to_warehouse_id,
        remarks: transferData.remarks || null,
      },
      { transaction: t }
    );

    // Delete existing items and serials
    const existingItems = await StockTransferItem.findAll({
      where: { stock_transfer_id: id },
      include: [{ model: StockTransferSerial, as: "serials" }],
      transaction: t,
    });

    for (const item of existingItems) {
      // Delete serials first
      if (item.serials && item.serials.length > 0) {
        await StockTransferSerial.destroy({
          where: { stock_transfer_item_id: item.id },
          transaction: t,
        });
      }
      // Delete item
      await item.destroy({ transaction: t });
    }

    // Create new items
    for (const item of items) {
      const product = await Product.findByPk(item.product_id, { transaction: t });
      if (!product) {
        throw new Error(`Product with id ${item.product_id} not found`);
      }

      // Validate serial count if required
      if (product.serial_required && item.serials) {
        if (item.serials.length !== item.transfer_quantity) {
          throw new Error(`Serial count (${item.serials.length}) must match transfer quantity (${item.transfer_quantity})`);
        }
      }

      const transferItem = await StockTransferItem.create(
        {
          stock_transfer_id: id,
          product_id: item.product_id,
          tracking_type: product.tracking_type === "SERIAL" ? "SERIAL" : "NONE",
          serial_required: product.serial_required,
          transfer_quantity: item.transfer_quantity,
        },
        { transaction: t }
      );

      if (item.serials && item.serials.length > 0) {
        for (const serial of item.serials) {
          await StockTransferSerial.create(
            {
              stock_transfer_item_id: transferItem.id,
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

    return transfer.toJSON();
  } catch (err) {
    if (committedHere) {
      await t.rollback();
    }
    throw err;
  }
};

const approveStockTransfer = async ({ id, approved_by, transaction } = {}) => {
  if (!id) return null;
  const models = getTenantModels();
  const { StockTransfer, StockTransferItem, StockTransferSerial, StockSerial, Product } = models;
  const t = transaction || (await models.sequelize.transaction());
  let committedHere = !transaction;

  try {
    const transfer = await StockTransfer.findOne({
      where: { id, deleted_at: null },
      include: [
        {
          model: StockTransferItem,
          as: "items",
          include: [
            { model: Product, as: "product" },
            {
              model: StockTransferSerial,
              as: "serials",
              include: [{ model: StockSerial, as: "stockSerial" }],
            },
          ],
        },
      ],
      transaction: t,
    });

    if (!transfer) throw new Error("Stock transfer not found");
    if (transfer.status !== TRANSFER_STATUS.DRAFT) {
      throw new Error(`Stock transfer is already ${transfer.status}`);
    }

    // Validate and process each item
    for (const item of transfer.items) {
      // Get source stock
      const sourceStock = await stockService.getOrCreateStock({
        product_id: item.product_id,
        warehouse_id: transfer.from_warehouse_id,
        product: item.product,
        transaction: t,
      });

      // Validate available quantity
      if (sourceStock.quantity_available < item.transfer_quantity) {
        throw new Error(`Insufficient stock for product ${item.product.product_name}. Available: ${sourceStock.quantity_available}, Required: ${item.transfer_quantity}`);
      }

      // Validate serials if required
      if (item.serial_required && item.serials) {
        if (item.serials.length !== item.transfer_quantity) {
          throw new Error(`Serial count mismatch for product ${item.product.product_name}`);
        }

        // Validate serials belong to source warehouse and are available
        for (const serial of item.serials) {
          const stockSerial = serial.stockSerial;
          if (stockSerial.warehouse_id !== transfer.from_warehouse_id) {
            throw new Error(`Serial ${stockSerial.serial_number} does not belong to source warehouse`);
          }
          if (stockSerial.status !== SERIAL_STATUS.AVAILABLE) {
            throw new Error(`Serial ${stockSerial.serial_number} is not available`);
          }
        }
      }

      // Update source warehouse stock (OUT)
      await stockService.updateStockQuantities({
        stock: sourceStock,
        quantity: item.transfer_quantity,
        last_updated_by: approved_by,
        isInward: false,
        transaction: t,
      });

      // Get or create destination stock
      const destStock = await stockService.getOrCreateStock({
        product_id: item.product_id,
        warehouse_id: transfer.to_warehouse_id,
        product: item.product,
        transaction: t,
      });

      // Update destination warehouse stock (IN)
      await stockService.updateStockQuantities({
        stock: destStock,
        quantity: item.transfer_quantity,
        last_updated_by: approved_by,
        isInward: true,
        transaction: t,
      });

      // Update serial warehouse_id if serials provided
      if (item.serials && item.serials.length > 0) {
        for (const serial of item.serials) {
          await serial.stockSerial.update(
            {
              warehouse_id: transfer.to_warehouse_id,
              stock_id: destStock.id,
            },
            { transaction: t }
          );
        }
      }

      // Create ledger entries
      // OUT from source
      await inventoryLedgerService.createLedgerEntry({
        product_id: item.product_id,
        warehouse_id: transfer.from_warehouse_id,
        stock_id: sourceStock.id,
        transaction_type: TRANSACTION_TYPE.TRANSFER_OUT,
        transaction_id: transfer.id,
        movement_type: MOVEMENT_TYPE.OUT,
        quantity: item.transfer_quantity,
        performed_by: approved_by,
        transaction: t,
      });

      // IN to destination
      await inventoryLedgerService.createLedgerEntry({
        product_id: item.product_id,
        warehouse_id: transfer.to_warehouse_id,
        stock_id: destStock.id,
        transaction_type: TRANSACTION_TYPE.TRANSFER_IN,
        transaction_id: transfer.id,
        movement_type: MOVEMENT_TYPE.IN,
        quantity: item.transfer_quantity,
        performed_by: approved_by,
        transaction: t,
      });
    }

    // Update transfer status
    await transfer.update(
      {
        status: TRANSFER_STATUS.APPROVED,
        approved_by,
        approved_at: new Date(),
      },
      { transaction: t }
    );

    if (committedHere) {
      await t.commit();
    }

    return transfer.toJSON();
  } catch (err) {
    if (committedHere) {
      await t.rollback();
    }
    throw err;
  }
};

const receiveStockTransfer = async ({ id, transaction } = {}) => {
  if (!id) return null;
  const models = getTenantModels();
  const { StockTransfer } = models;
  const t = transaction || (await models.sequelize.transaction());
  let committedHere = !transaction;

  try {
    const transfer = await StockTransfer.findOne({
      where: { id, deleted_at: null },
      transaction: t,
    });

    if (!transfer) throw new Error("Stock transfer not found");
    if (transfer.status !== TRANSFER_STATUS.APPROVED && transfer.status !== TRANSFER_STATUS.IN_TRANSIT) {
      throw new Error(`Stock transfer must be APPROVED or IN_TRANSIT to receive. Current status: ${transfer.status}`);
    }

    await transfer.update(
      {
        status: TRANSFER_STATUS.RECEIVED,
      },
      { transaction: t }
    );

    if (committedHere) {
      await t.commit();
    }

    return transfer.toJSON();
  } catch (err) {
    if (committedHere) {
      await t.rollback();
    }
    throw err;
  }
};

module.exports = {
  listStockTransfers,
  getStockTransferById,
  createStockTransfer,
  updateStockTransfer,
  approveStockTransfer,
  receiveStockTransfer,
};

