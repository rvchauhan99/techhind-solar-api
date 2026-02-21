"use strict";

const { Op, QueryTypes } = require("sequelize");
const { buildStringCond, buildDateCond } = require("../../common/utils/columnFilterBuilders.js");
const { getTenantModels } = require("../tenant/tenantModels.js");
const stockService = require("../stock/stock.service.js");
const inventoryLedgerService = require("../inventoryLedger/inventoryLedger.service.js");
const { TRANSACTION_TYPE, MOVEMENT_TYPE, SERIAL_STATUS } = require("../../common/utils/constants.js");

const generateShipmentNumber = async () => {
  const models = getTenantModels();
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const year = String(now.getFullYear()).slice(-2);
  const mmyy = `${month}${year}`;
  // QueryTypes.SELECT returns the rows array directly (do not destructure as [rows])
  const rows = await models.sequelize.query(
    `SELECT shipment_no FROM b2b_shipments WHERE shipment_no LIKE :pattern AND deleted_at IS NULL ORDER BY shipment_no DESC LIMIT 1`,
    { replacements: { pattern: `SH-${mmyy}%` }, type: QueryTypes.SELECT }
  );
  let seq = 1;
  if (Array.isArray(rows) && rows.length > 0 && rows[0].shipment_no) {
    const last = rows[0].shipment_no;
    const lastSeq = parseInt(last.slice(-4), 10);
    if (!Number.isNaN(lastSeq)) seq = lastSeq + 1;
  }
  return `SH-${mmyy}${String(seq).padStart(4, "0")}`;
};

const listShipments = async ({
  page = 1,
  limit = 20,
  q,
  filters = {},
  sortBy = "id",
  sortOrder = "DESC",
} = {}) => {
  const models = getTenantModels();
  const { B2BShipment, B2BClient, B2BSalesOrder, CompanyWarehouse, B2BInvoice } = models;
  const offset = (page - 1) * limit;
  const where = { deleted_at: null };
  if (q) where.shipment_no = { [Op.iLike]: `%${q}%` };

  const andConds = [];
  const shipmentNoCond = buildStringCond("shipment_no", filters.shipment_no, filters.shipment_no_op || "contains");
  if (shipmentNoCond) andConds.push(shipmentNoCond);
  const shipmentDateCond = buildDateCond(
    "shipment_date",
    filters.shipment_date,
    filters.shipment_date_op || "inRange",
    filters.shipment_date_to
  );
  if (shipmentDateCond) andConds.push(shipmentDateCond);
  if (andConds.length > 0) {
    where[Op.and] = where[Op.and] || [];
    where[Op.and].push(...andConds);
  }

  const orderNoCond = buildStringCond("$salesOrder.order_no$", filters.order_no, filters.order_no_op || "contains");
  if (orderNoCond) {
    where[Op.and] = where[Op.and] || [];
    where[Op.and].push(orderNoCond);
  }
  const clientNameCond = buildStringCond(
    "$client.client_name$",
    filters.client_name,
    filters.client_name_op || "contains"
  );
  if (clientNameCond) {
    where[Op.and] = where[Op.and] || [];
    where[Op.and].push(clientNameCond);
  }
  const warehouseNameCond = buildStringCond(
    "$warehouse.name$",
    filters.warehouse_name,
    filters.warehouse_name_op || "contains"
  );
  if (warehouseNameCond) {
    where[Op.and] = where[Op.and] || [];
    where[Op.and].push(warehouseNameCond);
  }
  const invoiceNoCond = buildStringCond(
    "$invoice.invoice_no$",
    filters.invoice_no,
    filters.invoice_no_op || "contains"
  );
  if (invoiceNoCond) {
    where[Op.and] = where[Op.and] || [];
    where[Op.and].push(invoiceNoCond);
  }

  const { count, rows } = await B2BShipment.findAndCountAll({
    where,
    include: [
      { model: B2BClient, as: "client", attributes: ["id", "client_code", "client_name"], required: false },
      { model: B2BSalesOrder, as: "salesOrder", attributes: ["id", "order_no"], required: false },
      { model: CompanyWarehouse, as: "warehouse", attributes: ["id", "name"], required: false },
      { model: B2BInvoice, as: "invoice", attributes: ["id", "invoice_no", "status"], required: false },
    ],
    order: [[sortBy, sortOrder]],
    limit,
    offset,
    distinct: true,
  });
  return { data: rows, meta: { total: count, page, limit, pages: limit > 0 ? Math.ceil(count / limit) : 0 } };
};

const getShipmentById = async ({ id }) => {
  const models = getTenantModels();
  const { B2BShipment, B2BClient, B2BClientShipTo, B2BSalesOrder, CompanyWarehouse, User, B2BInvoice, B2BShipmentItem, Product, ProductType } = models;
  return B2BShipment.findOne({
    where: { id, deleted_at: null },
    include: [
      { model: B2BClient, as: "client" },
      { model: B2BClientShipTo, as: "shipTo" },
      { model: B2BSalesOrder, as: "salesOrder" },
      { model: CompanyWarehouse, as: "warehouse" },
      { model: User, as: "createdBy", attributes: ["id", "name"] },
      { model: B2BInvoice, as: "invoice", attributes: ["id", "invoice_no", "status"], required: false },
      {
        model: B2BShipmentItem,
        as: "items",
        include: [{ model: Product, as: "product", include: [{ model: ProductType, as: "productType" }] }],
      },
    ],
  });
};

const createShipment = async ({ payload, user_id, transaction }) => {
  const models = getTenantModels();
  const { B2BShipment, B2BShipmentItem, B2BSalesOrder, B2BSalesOrderItem, B2BClient, CompanyWarehouse, User, Product, StockSerial } = models;
  const { items, ...header } = payload;
  if (!items || items.length === 0) {
    const err = new Error("At least one item is required");
    err.statusCode = 400;
    throw err;
  }

  const order = await B2BSalesOrder.findOne({
    where: { id: header.b2b_sales_order_id, deleted_at: null },
    include: [{ model: B2BSalesOrderItem, as: "items" }],
  });
  if (!order) {
    const err = new Error("Order not found");
    err.statusCode = 404;
    throw err;
  }
  if (order.status !== "CONFIRMED") {
    const err = new Error("Order must be confirmed to create shipment");
    err.statusCode = 400;
    throw err;
  }
  const plannedWarehouseId = order.planned_warehouse_id;
  if (!plannedWarehouseId) {
    const err = new Error("Order planned warehouse is not set");
    err.statusCode = 400;
    throw err;
  }
  if (header.warehouse_id && Number(header.warehouse_id) !== Number(plannedWarehouseId)) {
    const err = new Error("Shipment warehouse must match order planned warehouse");
    err.statusCode = 400;
    throw err;
  }
  header.warehouse_id = plannedWarehouseId;

  const warehouseWithManager = await CompanyWarehouse.findOne({
    where: { id: plannedWarehouseId, deleted_at: null },
    include: [{ model: User, as: "managers", attributes: ["id"], where: { id: user_id }, required: true }],
    transaction,
  });
  if (!warehouseWithManager) {
    const err = new Error("You are not a manager of the planned warehouse for this order");
    err.statusCode = 403;
    throw err;
  }

  const previousShipments = await B2BShipment.findAll({
    where: { b2b_sales_order_id: header.b2b_sales_order_id, deleted_at: null },
    include: [{ model: B2BShipmentItem, as: "items" }],
    transaction,
  });
  const shippedByProduct = {};
  previousShipments.forEach((s) => {
    (s.items || []).forEach((it) => {
      const pid = it.product_id;
      shippedByProduct[pid] = (shippedByProduct[pid] || 0) + (parseInt(it.quantity, 10) || 0);
    });
  });

  const orderItemsByProduct = {};
  (order.items || []).forEach((oi) => {
    orderItemsByProduct[oi.product_id] = { orderItem: oi, ordered: parseInt(oi.quantity, 10) || 0 };
  });

  for (const item of items) {
    const pid = item.product_id;
    const entry = orderItemsByProduct[pid];
    if (!entry) {
      const err = new Error(`Product id ${pid} is not in order`);
      err.statusCode = 400;
      throw err;
    }
    const prevShipped = shippedByProduct[pid] || 0;
    const currentQty = parseInt(item.quantity, 10) || 0;
    const totalShipped = prevShipped + currentQty;
    if (totalShipped > entry.ordered) {
      const err = new Error(`Total shipped for product ${pid} (${totalShipped}) exceeds ordered (${entry.ordered})`);
      err.statusCode = 400;
      throw err;
    }
  }

  if (!header.shipment_no) header.shipment_no = await generateShipmentNumber();
  header.shipment_date = header.shipment_date || new Date().toISOString().slice(0, 10);
  header.client_id = order.client_id;
  header.ship_to_id = order.ship_to_id;
  header.created_by = user_id;

  const shipment = await B2BShipment.create(header, { transaction });

  const productIds = [...new Set(items.map((i) => i.product_id))];
  const products = await Product.findAll({ where: { id: productIds, deleted_at: null }, transaction });
  const productMap = {};
  products.forEach((p) => { productMap[p.id] = p; });

  for (const item of items) {
    await B2BShipmentItem.create(
      {
        b2b_shipment_id: shipment.id,
        b2b_sales_order_item_id: item.b2b_sales_order_item_id || null,
        product_id: item.product_id,
        quantity: item.quantity,
        serials: item.serials || null,
        remarks: item.remarks,
      },
      { transaction }
    );

    const qty = parseInt(item.quantity, 10);
    if (!Number.isFinite(qty) || qty <= 0) continue;

    const product = productMap[item.product_id];
    if (!product) continue;

    const stock = await stockService.getOrCreateStock({
      product_id: item.product_id,
      warehouse_id: plannedWarehouseId,
      product,
      transaction,
    });

    if (stock.quantity_available < qty) {
      const err = new Error(`Insufficient stock for product id ${item.product_id}. Available: ${stock.quantity_available}, Required: ${qty}`);
      err.statusCode = 400;
      throw err;
    }

    const isSerialized = !!stock.serial_required || !!product.serial_required;
    const serialsRaw = item.serials || "";
    const serialList = serialsRaw.split(",").map((s) => s.trim()).filter((s) => s.length > 0);

    if (isSerialized) {
      if (serialList.length !== qty) {
        const err = new Error(`Serial count (${serialList.length}) must match quantity (${qty}) for product id ${item.product_id}`);
        err.statusCode = 400;
        throw err;
      }
      for (const serial of serialList) {
        const stockSerial = await StockSerial.findOne({
          where: {
            serial_number: serial,
            product_id: item.product_id,
            warehouse_id: plannedWarehouseId,
          },
          lock: transaction.LOCK.UPDATE,
          transaction,
        });
        if (!stockSerial) {
          const err = new Error(`Serial '${serial}' is not available at this warehouse for product id ${item.product_id}`);
          err.statusCode = 400;
          throw err;
        }
        if (stockSerial.status !== SERIAL_STATUS.AVAILABLE) {
          const err = new Error(`Serial ${serial} for product id ${item.product_id} is not available`);
          err.statusCode = 400;
          throw err;
        }
        await stockSerial.update(
          {
            status: SERIAL_STATUS.ISSUED,
            outward_date: new Date(),
            source_type: TRANSACTION_TYPE.B2B_SHIPMENT_OUT,
            source_id: shipment.id,
          },
          { transaction }
        );
        await inventoryLedgerService.createLedgerEntry({
          product_id: item.product_id,
          warehouse_id: plannedWarehouseId,
          stock_id: stock.id,
          transaction_type: TRANSACTION_TYPE.B2B_SHIPMENT_OUT,
          transaction_id: shipment.id,
          movement_type: MOVEMENT_TYPE.OUT,
          quantity: 1,
          serial_id: stockSerial.id,
          rate: null,
          gst_percent: null,
          amount: null,
          reason: `B2B shipment ${shipment.shipment_no}`,
          performed_by: user_id,
          transaction,
        });
      }
    } else {
      await inventoryLedgerService.createLedgerEntry({
        product_id: item.product_id,
        warehouse_id: plannedWarehouseId,
        stock_id: stock.id,
        transaction_type: TRANSACTION_TYPE.B2B_SHIPMENT_OUT,
        transaction_id: shipment.id,
        movement_type: MOVEMENT_TYPE.OUT,
        quantity: qty,
        rate: null,
        gst_percent: null,
        amount: null,
        reason: `B2B shipment ${shipment.shipment_no}`,
        performed_by: user_id,
        transaction,
      });
    }

    await stockService.updateStockQuantities({
      stock,
      quantity: qty,
      last_updated_by: user_id,
      isInward: false,
      transaction,
    });
  }

  for (const item of items) {
    const oi = orderItemsByProduct[item.product_id]?.orderItem;
    if (oi) {
      const currentShipped = parseInt(oi.shipped_quantity, 10) || 0;
      const addQty = parseInt(item.quantity, 10) || 0;
      await oi.update({ shipped_quantity: currentShipped + addQty }, { transaction });
    }
  }

  return getShipmentById({ id: shipment.id });
};

const deleteShipment = async ({ id, user_id, transaction }) => {
  const models = getTenantModels();
  const { B2BShipment, B2BShipmentItem, B2BSalesOrderItem, Product, B2BInvoice, StockSerial } = models;
  const shipment = await B2BShipment.findOne({
    where: { id, deleted_at: null },
    include: [{ model: B2BShipmentItem, as: "items" }],
    transaction,
  });
  if (!shipment) return null;

  const warehouseId = shipment.warehouse_id;
  const orderId = shipment.b2b_sales_order_id;

  if (warehouseId && shipment.items && shipment.items.length > 0) {
    const productIds = [...new Set(shipment.items.map((i) => i.product_id))];
    const products = await Product.findAll({ where: { id: productIds, deleted_at: null }, transaction });
    const productMap = {};
    products.forEach((p) => { productMap[p.id] = p; });

    for (const item of shipment.items) {
      const qty = parseInt(item.quantity, 10) || 0;
      if (qty <= 0) continue;

      const product = productMap[item.product_id];
      if (!product) continue;

      const stock = await stockService.getOrCreateStock({
        product_id: item.product_id,
        warehouse_id: warehouseId,
        product,
        transaction,
      });

      const isSerialized = !!stock.serial_required || !!product.serial_required;
      const serialsRaw = item.serials || "";
      const serialList = serialsRaw.split(",").map((s) => s.trim()).filter((s) => s.length > 0);

      if (isSerialized && serialList.length > 0) {
        for (const serial of serialList) {
          const stockSerial = await StockSerial.findOne({
            where: { serial_number: serial, product_id: item.product_id },
            transaction,
          });
          if (stockSerial) {
            await stockSerial.update(
              {
                status: SERIAL_STATUS.AVAILABLE,
                warehouse_id: warehouseId,
                stock_id: stock.id,
                source_type: TRANSACTION_TYPE.B2B_SHIPMENT_CANCEL_IN,
              },
              { transaction }
            );
            await inventoryLedgerService.createLedgerEntry({
              product_id: item.product_id,
              warehouse_id: warehouseId,
              stock_id: stock.id,
              transaction_type: TRANSACTION_TYPE.B2B_SHIPMENT_CANCEL_IN,
              transaction_id: shipment.id,
              movement_type: MOVEMENT_TYPE.IN,
              quantity: 1,
              serial_id: stockSerial.id,
              rate: null,
              gst_percent: null,
              amount: null,
              reason: `Reversal for B2B shipment ${shipment.shipment_no}`,
              performed_by: user_id,
              transaction,
            });
          } else {
            await inventoryLedgerService.createLedgerEntry({
              product_id: item.product_id,
              warehouse_id: warehouseId,
              stock_id: stock.id,
              transaction_type: TRANSACTION_TYPE.B2B_SHIPMENT_CANCEL_IN,
              transaction_id: shipment.id,
              movement_type: MOVEMENT_TYPE.IN,
              quantity: 1,
              serial_id: null,
              rate: null,
              gst_percent: null,
              amount: null,
              reason: `Reversal for B2B shipment ${shipment.shipment_no}`,
              performed_by: user_id,
              transaction,
            });
          }
        }
      } else {
        await inventoryLedgerService.createLedgerEntry({
          product_id: item.product_id,
          warehouse_id: warehouseId,
          stock_id: stock.id,
          transaction_type: TRANSACTION_TYPE.B2B_SHIPMENT_CANCEL_IN,
          transaction_id: shipment.id,
          movement_type: MOVEMENT_TYPE.IN,
          quantity: qty,
          serial_id: null,
          rate: null,
          gst_percent: null,
          amount: null,
          reason: `Reversal for B2B shipment ${shipment.shipment_no}`,
          performed_by: user_id,
          transaction,
        });
      }

      await stockService.updateStockQuantities({
        stock,
        quantity: qty,
        last_updated_by: user_id,
        isInward: true,
        transaction,
      });
    }
  }

  for (const item of shipment.items) {
    const orderItem = await B2BSalesOrderItem.findByPk(item.b2b_sales_order_item_id, { transaction });
    if (orderItem) {
      const currentShipped = parseInt(orderItem.shipped_quantity, 10) || 0;
      const subQty = parseInt(item.quantity, 10) || 0;
      await orderItem.update({ shipped_quantity: Math.max(0, currentShipped - subQty) }, { transaction });
    }
  }

  const hasInvoice = await B2BInvoice.count({ where: { b2b_shipment_id: id, deleted_at: null }, transaction });
  if (hasInvoice > 0) {
    const err = new Error("Cannot delete shipment with existing invoice");
    err.statusCode = 400;
    throw err;
  }

  await shipment.destroy({ transaction });
  return { message: "Shipment deleted successfully" };
};

module.exports = {
  generateShipmentNumber,
  listShipments,
  getShipmentById,
  createShipment,
  deleteShipment,
};
