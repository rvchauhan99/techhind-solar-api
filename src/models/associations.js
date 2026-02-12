"use strict";

module.exports = (db) => {
  const {
    User,
    Role,
    Module,
    RoleModule,
    UserToken,
    PasswordResetOtp,
    State,
    City,
    Discom,
    ProductType,
    ProductMake,
    MeasurementUnit,
    ServiceCategory,
    ServicePriceList,
    ServiceType,
    Division,
    SubDivision,
    TaskPlannerCategory,
    TaskPriority,
    PlannerAuto,
    Company,
    CompanyBankAccount,
    CompanyBranch,
    CompanyWarehouse,
    SiteVisit,
    PaymentMode,
    Bank,
    SiteSurvey,
    Customer,
    Inquiry,
    InquirySource,
    ProjectScheme,
    OrderType,
    Followup,
    InquiryDocument,
    ProjectPrice,
    Quotation,
    Supplier,
    PurchaseOrder,
    PurchaseOrderItem,
    POInward,
    POInwardItem,
    POInwardSerial,
    Stock,
    StockSerial,
    InventoryLedger,
    StockTransfer,
    StockTransferItem,
    StockTransferSerial,
    StockAdjustment,
    StockAdjustmentItem,
    StockAdjustmentSerial,
    Challan,
    ChallanItems,
    PanelTechnology,
    Fabrication,
    Installation,
  } = db;

  // User ↔ Role
  if (User && Role) {
    User.belongsTo(Role, { foreignKey: "role_id", as: "role" });
    Role.hasMany(User, { foreignKey: "role_id", as: "users" });
  }

  // User ↔ User (manager/reportees)
  if (User) {
    User.belongsTo(User, { foreignKey: "manager_id", as: "manager" });
    User.hasMany(User, { foreignKey: "manager_id", as: "reportees" });
  }

  // Role ↔ Module (Many-to-Many via RoleModule)
  if (Role && Module && RoleModule) {
    Role.hasMany(RoleModule, { foreignKey: "role_id", as: "roleModules" });
    Module.hasMany(RoleModule, { foreignKey: "module_id", as: "roleModules" });
    RoleModule.belongsTo(Module, { foreignKey: "module_id", as: "module" });
    // ensure RoleModule can access its Role as well
    RoleModule.belongsTo(Role, { foreignKey: "role_id", as: "role" });
  }

  // User ↔ UserToken (One-to-Many)
  if (User && UserToken) {
    User.hasMany(UserToken, { foreignKey: "user_id", as: "tokens" });
    UserToken.belongsTo(User, { foreignKey: "user_id", as: "user" });
  }

  // User ↔ PasswordResetOtp (One-to-Many)
  if (User && PasswordResetOtp) {
    User.hasMany(PasswordResetOtp, { foreignKey: "user_id", as: "passwordResetOtps" });
    PasswordResetOtp.belongsTo(User, { foreignKey: "user_id", as: "user" });
  }

  // State ↔ City (One-to-Many)
  if (State && City) {
    City.belongsTo(State, { foreignKey: "state_id", as: "state" });
    State.hasMany(City, { foreignKey: "state_id", as: "cities" });
  }

  // State ↔ Discom
  if (State && Discom) {
    Discom.belongsTo(State, { foreignKey: "state_id", as: "state" });
    State.hasMany(Discom, { foreignKey: "state_id", as: "discoms" });
  }

  // State ↔ Supplier
  if (State && Supplier) {
    Supplier.belongsTo(State, { foreignKey: "state_id", as: "state" });
    State.hasMany(Supplier, { foreignKey: "state_id", as: "suppliers" });
  }

  // ProductType ↔ ProductMake
  if (ProductType && ProductMake) {
    ProductMake.belongsTo(ProductType, { foreignKey: "product_type_id", as: "productType" });
    ProductType.hasMany(ProductMake, { foreignKey: "product_type_id", as: "productMakes" });
  }

  // Product ↔ ProductType, ProductMake, MeasurementUnit
  const Product = db.Product;
  if (Product && ProductType) {
    Product.belongsTo(ProductType, { foreignKey: "product_type_id", as: "productType" });
    ProductType.hasMany(Product, { foreignKey: "product_type_id", as: "products" });
  }
  if (Product && ProductMake) {
    Product.belongsTo(ProductMake, { foreignKey: "product_make_id", as: "productMake" });
    ProductMake.hasMany(Product, { foreignKey: "product_make_id", as: "products" });
  }
  if (Product && MeasurementUnit) {
    Product.belongsTo(MeasurementUnit, { foreignKey: "measurement_unit_id", as: "measurementUnit" });
    MeasurementUnit.hasMany(Product, { foreignKey: "measurement_unit_id", as: "products" });
  }

  // MeasurementUnit ↔ ServicePriceList
  if (MeasurementUnit && ServicePriceList) {
    ServicePriceList.belongsTo(MeasurementUnit, { foreignKey: "unit_id", as: "unit" });
    MeasurementUnit.hasMany(ServicePriceList, { foreignKey: "unit_id", as: "servicePriceLists" });
  }

  // ServiceCategory ↔ ServiceType
  if (ServiceCategory && ServiceType) {
    ServiceType.belongsTo(ServiceCategory, { foreignKey: "service_category_id", as: "serviceCategory" });
    ServiceCategory.hasMany(ServiceType, { foreignKey: "service_category_id", as: "serviceTypes" });
  }

  // Division ↔ SubDivision
  if (Division && SubDivision) {
    SubDivision.belongsTo(Division, { foreignKey: "division_id", as: "division" });
    Division.hasMany(SubDivision, { foreignKey: "division_id", as: "subDivisions" });
  }

  // PlannerAuto ↔ TaskPlannerCategory / TaskPriority
  if (PlannerAuto && TaskPlannerCategory) {
    PlannerAuto.belongsTo(TaskPlannerCategory, { foreignKey: "task_category_id", as: "taskCategory" });
    TaskPlannerCategory.hasMany(PlannerAuto, { foreignKey: "task_category_id", as: "plannerAutos" });
  }
  if (PlannerAuto && TaskPriority) {
    PlannerAuto.belongsTo(TaskPriority, { foreignKey: "task_priority_id", as: "taskPriority" });
    TaskPriority.hasMany(PlannerAuto, { foreignKey: "task_priority_id", as: "plannerAutos" });
  }

  // PlannerAuto ↔ User (Many-to-Many via planner_auto_users)
  if (PlannerAuto && User) {
    PlannerAuto.belongsToMany(User, {
      through: "planner_auto_users",
      foreignKey: "planner_auto_id",
      otherKey: "user_id",
      as: "assignedUsers",
    });
    User.belongsToMany(PlannerAuto, {
      through: "planner_auto_users",
      foreignKey: "user_id",
      otherKey: "planner_auto_id",
      as: "plannerAutos",
    });
  }

  // Company ↔ CompanyBankAccount (One-to-Many)
  if (Company && CompanyBankAccount) {
    Company.hasMany(CompanyBankAccount, { foreignKey: "company_id", as: "bankAccounts" });
    CompanyBankAccount.belongsTo(Company, { foreignKey: "company_id", as: "company" });
  }

  // Company ↔ CompanyBranch (One-to-Many)
  if (Company && CompanyBranch) {
    Company.hasMany(CompanyBranch, { foreignKey: "company_id", as: "branches" });
    CompanyBranch.belongsTo(Company, { foreignKey: "company_id", as: "company" });
  }

  // Company ↔ CompanyWarehouse (One-to-Many)
  if (Company && CompanyWarehouse) {
    Company.hasMany(CompanyWarehouse, { foreignKey: "company_id", as: "warehouses" });
    CompanyWarehouse.belongsTo(Company, { foreignKey: "company_id", as: "company" });
  }

  // State ↔ CompanyWarehouse (One-to-Many)
  if (State && CompanyWarehouse) {
    State.hasMany(CompanyWarehouse, { foreignKey: "state_id", as: "warehouses" });
    CompanyWarehouse.belongsTo(State, { foreignKey: "state_id", as: "state" });
  }

  // CompanyWarehouse ↔ User (Many-to-Many via company_warehouse_managers)
  if (CompanyWarehouse && User) {
    CompanyWarehouse.belongsToMany(User, {
      through: "company_warehouse_managers",
      foreignKey: "warehouse_id",
      otherKey: "user_id",
      as: "managers",
    });
    User.belongsToMany(CompanyWarehouse, {
      through: "company_warehouse_managers",
      foreignKey: "user_id",
      otherKey: "warehouse_id",
      as: "managedWarehouses",
    });
  }

  // Inquiry ↔ SiteVisit (One-to-Many)
  if (Inquiry && SiteVisit) {
    Inquiry.hasMany(SiteVisit, { foreignKey: "inquiry_id", as: "siteVisits" });
    SiteVisit.belongsTo(Inquiry, { foreignKey: "inquiry_id", as: "inquiry" });
  }

  // User ↔ SiteVisit (One-to-Many)
  if (User && SiteVisit) {
    User.hasMany(SiteVisit, { foreignKey: "visited_by", as: "siteVisits" });
    SiteVisit.belongsTo(User, { foreignKey: "visited_by", as: "visitedBy" });
  }

  // SiteVisit ↔ SiteSurvey (One-to-One)
  if (SiteVisit && SiteSurvey) {
    SiteVisit.hasOne(SiteSurvey, { foreignKey: "site_visit_id", as: "siteSurvey" });
    SiteSurvey.belongsTo(SiteVisit, { foreignKey: "site_visit_id", as: "siteVisit" });
  }

  // User ↔ SiteSurvey (One-to-Many as surveyor)
  if (User && SiteSurvey) {
    User.hasMany(SiteSurvey, { foreignKey: "surveyor_id", as: "siteSurveys" });
    SiteSurvey.belongsTo(User, { foreignKey: "surveyor_id", as: "surveyor" });
  }

  // Customer ↔ Inquiry (One-to-Many)
  if (Customer && Inquiry) {
    Inquiry.belongsTo(Customer, { foreignKey: "customer_id", as: "customer" });
    Customer.hasMany(Inquiry, { foreignKey: "customer_id", as: "inquiries" });
  }

  // Inquiry ↔ InquirySource
  if (Inquiry && InquirySource) {
    Inquiry.belongsTo(InquirySource, { foreignKey: "inquiry_source_id", as: "inquirySource" });
    InquirySource.hasMany(Inquiry, { foreignKey: "inquiry_source_id", as: "inquiries" });
  }

  // Inquiry ↔ ProjectScheme
  if (Inquiry && ProjectScheme) {
    Inquiry.belongsTo(ProjectScheme, { foreignKey: "project_scheme_id", as: "projectScheme" });
    ProjectScheme.hasMany(Inquiry, { foreignKey: "project_scheme_id", as: "inquiries" });
  }

  // Inquiry ↔ User (inquiry_by / handled_by / channel_partner)
  if (Inquiry && User) {
    Inquiry.belongsTo(User, { foreignKey: "inquiry_by", as: "inquiryBy" });
    Inquiry.belongsTo(User, { foreignKey: "handled_by", as: "handledBy" });
    Inquiry.belongsTo(User, { foreignKey: "channel_partner", as: "channelPartner" });
  }

  // Inquiry ↔ CompanyBranch
  if (Inquiry && CompanyBranch) {
    Inquiry.belongsTo(CompanyBranch, { foreignKey: "branch_id", as: "branch" });
    CompanyBranch.hasMany(Inquiry, { foreignKey: "branch_id", as: "inquiries" });
  }

  // Inquiry ↔ Discom
  if (Inquiry && Discom) {
    Inquiry.belongsTo(Discom, { foreignKey: "discom_id", as: "discom" });
    Discom.hasMany(Inquiry, { foreignKey: "discom_id", as: "inquiries" });
  }

  // Inquiry ↔ OrderType
  if (Inquiry && OrderType) {
    Inquiry.belongsTo(OrderType, { foreignKey: "order_type", as: "orderType" });
    OrderType.hasMany(Inquiry, { foreignKey: "order_type", as: "inquiries" });
  }

  // Customer ↔ State
  if (Customer && State) {
    Customer.belongsTo(State, { foreignKey: "state_id", as: "state" });
    State.hasMany(Customer, { foreignKey: "state_id", as: "customers" });
  }

  // Customer ↔ City
  if (Customer && City) {
    Customer.belongsTo(City, { foreignKey: "city_id", as: "city" });
    City.hasMany(Customer, { foreignKey: "city_id", as: "customers" });
  }
  if (Inquiry && Followup) {
    Inquiry.hasMany(Followup, { foreignKey: "inquiry_id", as: "followups" });
    Followup.belongsTo(Inquiry, { foreignKey: "inquiry_id", as: "inquiry" });
  }

  // Followup ↔ User (call_by)
  if (Followup && User) {
    Followup.belongsTo(User, { foreignKey: "call_by", as: "callByUser" });
    User.hasMany(Followup, { foreignKey: "call_by", as: "followups" });
  }

  // Inquiry InquiryDocument (One-to-Many)
  if (Inquiry && InquiryDocument) {
    Inquiry.hasMany(InquiryDocument, { foreignKey: "inquiry_id", as: "documents" });
    InquiryDocument.belongsTo(Inquiry, { foreignKey: "inquiry_id", as: "inquiry" });
  }
  if (ProjectPrice && State) {
    ProjectPrice.belongsTo(State, { foreignKey: "state_id", as: "state" });
    State.hasMany(ProjectPrice, { foreignKey: "state_id", as: "projectPrices" });
  }
  if (ProjectPrice && ProjectScheme) {
    ProjectPrice.belongsTo(ProjectScheme, { foreignKey: "project_for_id", as: "projectScheme" });
    ProjectScheme.hasMany(ProjectPrice, { foreignKey: "project_for_id", as: "projectPrices" });
  }
  if (ProjectPrice && OrderType) {
    ProjectPrice.belongsTo(OrderType, { foreignKey: "order_type_id", as: "orderType" });
    OrderType.hasMany(ProjectPrice, { foreignKey: "order_type_id", as: "projectPrices" });
  }
  if (ProjectPrice && db.BillOfMaterial) {
    ProjectPrice.belongsTo(db.BillOfMaterial, { foreignKey: "bill_of_material_id", as: "billOfMaterial" });
    db.BillOfMaterial.hasMany(ProjectPrice, { foreignKey: "bill_of_material_id", as: "projectPrices" });
  }

  // Quotation associations
  if (Quotation && User) {
    Quotation.belongsTo(User, { foreignKey: "user_id", as: "user" });
    User.hasMany(Quotation, { foreignKey: "user_id", as: "quotations" });
  }
  if (Quotation && CompanyBranch) {
    Quotation.belongsTo(CompanyBranch, { foreignKey: "branch_id", as: "branch" });
    CompanyBranch.hasMany(Quotation, { foreignKey: "branch_id", as: "quotations" });
  }
  if (Quotation && Customer) {
    Quotation.belongsTo(Customer, { foreignKey: "customer_id", as: "customer" });
    Customer.hasMany(Quotation, { foreignKey: "customer_id", as: "quotations" });
  }
  if (Quotation && State) {
    Quotation.belongsTo(State, { foreignKey: "state_id", as: "state" });
    State.hasMany(Quotation, { foreignKey: "state_id", as: "quotations" });
  }
  if (Quotation && OrderType) {
    Quotation.belongsTo(OrderType, { foreignKey: "order_type_id", as: "orderType" });
    OrderType.hasMany(Quotation, { foreignKey: "order_type_id", as: "quotations" });
  }
  if (Quotation && ProjectScheme) {
    Quotation.belongsTo(ProjectScheme, { foreignKey: "project_scheme_id", as: "projectScheme" });
    ProjectScheme.hasMany(Quotation, { foreignKey: "project_scheme_id", as: "quotations" });
  }
  if (Quotation && ProjectPrice) {
    Quotation.belongsTo(ProjectPrice, { foreignKey: "project_price_id", as: "projectPrice" });
    ProjectPrice.hasMany(Quotation, { foreignKey: "project_price_id", as: "quotations" });
  }
  if (Quotation && Inquiry) {
    Quotation.belongsTo(Inquiry, { foreignKey: "inquiry_id", as: "inquiry" });
    Inquiry.hasMany(Quotation, { foreignKey: "inquiry_id", as: "quotations" });
  }
  if (Quotation && Product) {
    Quotation.belongsTo(Product, { foreignKey: "structure_product", as: "structureProduct" });
    Product.hasMany(Quotation, { foreignKey: "structure_product", as: "structureQuotations" });

    Quotation.belongsTo(Product, { foreignKey: "panel_product", as: "panelProduct" });
    Product.hasMany(Quotation, { foreignKey: "panel_product", as: "panelQuotations" });

    Quotation.belongsTo(Product, { foreignKey: "inverter_product", as: "inverterProduct" });
    Product.hasMany(Quotation, { foreignKey: "inverter_product", as: "inverterQuotations" });

    Quotation.belongsTo(Product, { foreignKey: "battery_product", as: "batteryProduct" });
    Product.hasMany(Quotation, { foreignKey: "battery_product", as: "batteryQuotations" });

    Quotation.belongsTo(Product, { foreignKey: "hybrid_inverter_product", as: "hybridInverterProduct" });
    Product.hasMany(Quotation, { foreignKey: "hybrid_inverter_product", as: "hybridInverterQuotations" });

    Quotation.belongsTo(Product, { foreignKey: "acdb_product", as: "acdbProduct" });
    Product.hasMany(Quotation, { foreignKey: "acdb_product", as: "acdbQuotations" });

    Quotation.belongsTo(Product, { foreignKey: "dcdb_product", as: "dcdbProduct" });
    Product.hasMany(Quotation, { foreignKey: "dcdb_product", as: "dcdbQuotations" });

    Quotation.belongsTo(Product, { foreignKey: "cable_ac_product", as: "cableAcProduct" });
    Product.hasMany(Quotation, { foreignKey: "cable_ac_product", as: "cableAcQuotations" });

    Quotation.belongsTo(Product, { foreignKey: "cable_dc_product", as: "cableDcProduct" });
    Product.hasMany(Quotation, { foreignKey: "cable_dc_product", as: "cableDcQuotations" });

    Quotation.belongsTo(Product, { foreignKey: "earthing_product", as: "earthingProduct" });
    Product.hasMany(Quotation, { foreignKey: "earthing_product", as: "earthingQuotations" });

    Quotation.belongsTo(Product, { foreignKey: "la_product", as: "laProduct" });
    Product.hasMany(Quotation, { foreignKey: "la_product", as: "laQuotations" });
  }

  // Order associations
  const Order = db.Order;
  const LoanType = db.LoanType;

  if (Order && Inquiry) {
    Order.belongsTo(Inquiry, { foreignKey: "inquiry_id", as: "inquiry" });
    Inquiry.hasMany(Order, { foreignKey: "inquiry_id", as: "orders" });
  }
  if (Order && Quotation) {
    Order.belongsTo(Quotation, { foreignKey: "quotation_id", as: "quotation" });
    Quotation.hasMany(Order, { foreignKey: "quotation_id", as: "orders" });
  }
  if (Order && Customer) {
    Order.belongsTo(Customer, { foreignKey: "customer_id", as: "customer" });
    Customer.hasMany(Order, { foreignKey: "customer_id", as: "orders" });
  }
  if (Order && User) {
    Order.belongsTo(User, { foreignKey: "inquiry_by", as: "inquiryBy" });
    Order.belongsTo(User, { foreignKey: "handled_by", as: "handledBy" });
    Order.belongsTo(User, { foreignKey: "channel_partner_id", as: "channelPartner" });
  }
  if (Order && InquirySource) {
    Order.belongsTo(InquirySource, { foreignKey: "inquiry_source_id", as: "inquirySource" });
    InquirySource.hasMany(Order, { foreignKey: "inquiry_source_id", as: "orders" });
  }
  if (Order && CompanyBranch) {
    Order.belongsTo(CompanyBranch, { foreignKey: "branch_id", as: "branch" });
    CompanyBranch.hasMany(Order, { foreignKey: "branch_id", as: "orders" });
  }
  if (Order && ProjectScheme) {
    Order.belongsTo(ProjectScheme, { foreignKey: "project_scheme_id", as: "projectScheme" });
    ProjectScheme.hasMany(Order, { foreignKey: "project_scheme_id", as: "orders" });
  }
  if (Order && OrderType) {
    Order.belongsTo(OrderType, { foreignKey: "order_type_id", as: "orderType" });
    OrderType.hasMany(Order, { foreignKey: "order_type_id", as: "orders" });
  }
  if (Order && Discom) {
    Order.belongsTo(Discom, { foreignKey: "discom_id", as: "discom" });
    Discom.hasMany(Order, { foreignKey: "discom_id", as: "orders" });
  }
  if (Order && Division) {
    Order.belongsTo(Division, { foreignKey: "division_id", as: "division" });
    Division.hasMany(Order, { foreignKey: "division_id", as: "orders" });
  }
  if (Order && SubDivision) {
    Order.belongsTo(SubDivision, { foreignKey: "sub_division_id", as: "subDivision" });
    SubDivision.hasMany(Order, { foreignKey: "sub_division_id", as: "orders" });
  }
  // payment_type is now a STRING field (not a foreign key), so no association needed
  if (Order && LoanType) {
    Order.belongsTo(LoanType, { foreignKey: "loan_type_id", as: "loanType" });
    LoanType.hasMany(Order, { foreignKey: "loan_type_id", as: "orders" });
  }
  if (Order && Product) {
    Order.belongsTo(Product, { foreignKey: "solar_panel_id", as: "solarPanel" });
    Product.hasMany(Order, { foreignKey: "solar_panel_id", as: "ordersAsSolarPanel" });

    Order.belongsTo(Product, { foreignKey: "inverter_id", as: "inverter" });
    Product.hasMany(Order, { foreignKey: "inverter_id", as: "ordersAsInverter" });
  }
  const ProjectPhase = db.ProjectPhase;
  if (Order && ProjectPhase) {
    Order.belongsTo(ProjectPhase, { foreignKey: "project_phase_id", as: "projectPhase" });
    ProjectPhase.hasMany(Order, { foreignKey: "project_phase_id", as: "orders" });
  }

  if (Order && CompanyWarehouse) {
    Order.belongsTo(CompanyWarehouse, { foreignKey: "planned_warehouse_id", as: "plannedWarehouse" });
    CompanyWarehouse.hasMany(Order, { foreignKey: "planned_warehouse_id", as: "orders" });
  }

  // OrderDocument associations
  const OrderDocument = db.OrderDocument;
  if (Order && OrderDocument) {
    Order.hasMany(OrderDocument, { foreignKey: "order_id", as: "documents" });
    OrderDocument.belongsTo(Order, { foreignKey: "order_id", as: "order" });
  }


  // OrderPaymentDetail associations
  const OrderPaymentDetail = db.OrderPaymentDetail;


  if (Order && OrderPaymentDetail) {
    Order.hasMany(OrderPaymentDetail, { foreignKey: "order_id", as: "paymentDetails" });
    OrderPaymentDetail.belongsTo(Order, { foreignKey: "order_id", as: "order" });
  }

  if (PaymentMode && OrderPaymentDetail) {
    OrderPaymentDetail.belongsTo(PaymentMode, { foreignKey: "payment_mode_id", as: "paymentMode" });
    PaymentMode.hasMany(OrderPaymentDetail, { foreignKey: "payment_mode_id", as: "orderPayments" });
  }

  if (Bank && OrderPaymentDetail) {
    OrderPaymentDetail.belongsTo(Bank, { foreignKey: "bank_id", as: "bank" });
    Bank.hasMany(OrderPaymentDetail, { foreignKey: "bank_id", as: "orderPayments" });
  }

  if (CompanyBankAccount && OrderPaymentDetail) {
    OrderPaymentDetail.belongsTo(CompanyBankAccount, { foreignKey: "company_bank_account_id", as: "companyBankAccount" });
    CompanyBankAccount.hasMany(OrderPaymentDetail, { foreignKey: "company_bank_account_id", as: "orderPayments" });
  }

  // Purchase Order associations
  if (PurchaseOrder && Supplier) {
    PurchaseOrder.belongsTo(Supplier, { foreignKey: "supplier_id", as: "supplier" });
    Supplier.hasMany(PurchaseOrder, { foreignKey: "supplier_id", as: "purchaseOrders" });
  }
  if (PurchaseOrder && Company) {
    PurchaseOrder.belongsTo(Company, { foreignKey: "bill_to_id", as: "billTo" });
    Company.hasMany(PurchaseOrder, { foreignKey: "bill_to_id", as: "purchaseOrders" });
    CompanyBranch.hasMany(PurchaseOrder, { foreignKey: "bill_to_id", as: "purchaseOrders" });
  }
  if (PurchaseOrder && CompanyWarehouse) {
    PurchaseOrder.belongsTo(CompanyWarehouse, { foreignKey: "ship_to_id", as: "shipTo" });
    CompanyWarehouse.hasMany(PurchaseOrder, { foreignKey: "ship_to_id", as: "purchaseOrders" });
  }
  if (PurchaseOrder && User) {
    PurchaseOrder.belongsTo(User, { foreignKey: "created_by", as: "createdBy" });
    PurchaseOrder.belongsTo(User, { foreignKey: "approved_by", as: "approvedBy" });
    User.hasMany(PurchaseOrder, { foreignKey: "created_by", as: "createdPurchaseOrders" });
    User.hasMany(PurchaseOrder, { foreignKey: "approved_by", as: "approvedPurchaseOrders" });
  }

  // PanelTechnology ↔ User (created_by, updated_by)
  if (PanelTechnology && User) {
    PanelTechnology.belongsTo(User, { foreignKey: "created_by", as: "createdBy" });
    PanelTechnology.belongsTo(User, { foreignKey: "updated_by", as: "updatedBy" });
    User.hasMany(PanelTechnology, { foreignKey: "created_by", as: "createdPanelTechnologies" });
    User.hasMany(PanelTechnology, { foreignKey: "updated_by", as: "updatedPanelTechnologies" });
  }
  if (PurchaseOrder && PurchaseOrderItem) {
    PurchaseOrder.hasMany(PurchaseOrderItem, { foreignKey: "purchase_order_id", as: "items" });
    PurchaseOrderItem.belongsTo(PurchaseOrder, { foreignKey: "purchase_order_id", as: "purchaseOrder" });
  }
  if (PurchaseOrderItem && Product) {
    PurchaseOrderItem.belongsTo(Product, { foreignKey: "product_id", as: "product" });
    Product.hasMany(PurchaseOrderItem, { foreignKey: "product_id", as: "purchaseOrderItems" });
  }

  // PO Inward associations
  if (POInward && PurchaseOrder) {
    POInward.belongsTo(PurchaseOrder, { foreignKey: "purchase_order_id", as: "purchaseOrder" });
    PurchaseOrder.hasMany(POInward, { foreignKey: "purchase_order_id", as: "poInwards" });
  }
  if (POInward && Supplier) {
    POInward.belongsTo(Supplier, { foreignKey: "supplier_id", as: "supplier" });
    Supplier.hasMany(POInward, { foreignKey: "supplier_id", as: "poInwards" });
  }
  if (POInward && CompanyWarehouse) {
    POInward.belongsTo(CompanyWarehouse, { foreignKey: "warehouse_id", as: "warehouse" });
    CompanyWarehouse.hasMany(POInward, { foreignKey: "warehouse_id", as: "poInwards" });
  }
  if (POInward && User) {
    POInward.belongsTo(User, { foreignKey: "received_by", as: "receivedBy" });
    User.hasMany(POInward, { foreignKey: "received_by", as: "poInwards" });
  }
  if (POInward && POInwardItem) {
    POInward.hasMany(POInwardItem, { foreignKey: "po_inward_id", as: "items" });
    POInwardItem.belongsTo(POInward, { foreignKey: "po_inward_id", as: "poInward" });
  }
  if (POInwardItem && PurchaseOrderItem) {
    POInwardItem.belongsTo(PurchaseOrderItem, { foreignKey: "purchase_order_item_id", as: "purchaseOrderItem" });
    PurchaseOrderItem.hasMany(POInwardItem, { foreignKey: "purchase_order_item_id", as: "poInwardItems" });
  }
  if (POInwardItem && Product) {
    POInwardItem.belongsTo(Product, { foreignKey: "product_id", as: "product" });
    Product.hasMany(POInwardItem, { foreignKey: "product_id", as: "poInwardItems" });
  }
  if (POInwardItem && POInwardSerial) {
    POInwardItem.hasMany(POInwardSerial, { foreignKey: "po_inward_item_id", as: "serials" });
    POInwardSerial.belongsTo(POInwardItem, { foreignKey: "po_inward_item_id", as: "poInwardItem" });
  }

  // Stock associations
  if (Stock && Product) {
    Stock.belongsTo(Product, { foreignKey: "product_id", as: "product" });
    Product.hasMany(Stock, { foreignKey: "product_id", as: "stocks" });
  }
  if (Stock && CompanyWarehouse) {
    Stock.belongsTo(CompanyWarehouse, { foreignKey: "warehouse_id", as: "warehouse" });
    CompanyWarehouse.hasMany(Stock, { foreignKey: "warehouse_id", as: "stocks" });
  }
  if (Stock && User) {
    Stock.belongsTo(User, { foreignKey: "last_updated_by", as: "lastUpdatedBy" });
    User.hasMany(Stock, { foreignKey: "last_updated_by", as: "updatedStocks" });
  }
  if (Stock && StockSerial) {
    Stock.hasMany(StockSerial, { foreignKey: "stock_id", as: "serials" });
    StockSerial.belongsTo(Stock, { foreignKey: "stock_id", as: "stock" });
  }
  if (StockSerial && Product) {
    StockSerial.belongsTo(Product, { foreignKey: "product_id", as: "product" });
    Product.hasMany(StockSerial, { foreignKey: "product_id", as: "stockSerials" });
  }
  if (StockSerial && CompanyWarehouse) {
    StockSerial.belongsTo(CompanyWarehouse, { foreignKey: "warehouse_id", as: "warehouse" });
    CompanyWarehouse.hasMany(StockSerial, { foreignKey: "warehouse_id", as: "stockSerials" });
  }

  // Inventory Ledger associations
  if (InventoryLedger && Product) {
    InventoryLedger.belongsTo(Product, { foreignKey: "product_id", as: "product" });
    Product.hasMany(InventoryLedger, { foreignKey: "product_id", as: "inventoryLedgerEntries" });
  }
  if (InventoryLedger && CompanyWarehouse) {
    InventoryLedger.belongsTo(CompanyWarehouse, { foreignKey: "warehouse_id", as: "warehouse" });
    CompanyWarehouse.hasMany(InventoryLedger, { foreignKey: "warehouse_id", as: "inventoryLedgerEntries" });
  }
  if (InventoryLedger && Stock) {
    InventoryLedger.belongsTo(Stock, { foreignKey: "stock_id", as: "stock" });
    Stock.hasMany(InventoryLedger, { foreignKey: "stock_id", as: "ledgerEntries" });
  }
  if (InventoryLedger && StockSerial) {
    InventoryLedger.belongsTo(StockSerial, { foreignKey: "serial_id", as: "serial" });
    StockSerial.hasMany(InventoryLedger, { foreignKey: "serial_id", as: "ledgerEntries" });
  }
  if (InventoryLedger && User) {
    InventoryLedger.belongsTo(User, { foreignKey: "performed_by", as: "performedBy" });
    User.hasMany(InventoryLedger, { foreignKey: "performed_by", as: "inventoryLedgerEntries" });
  }

  // Stock Transfer associations
  if (StockTransfer && CompanyWarehouse) {
    StockTransfer.belongsTo(CompanyWarehouse, { foreignKey: "from_warehouse_id", as: "fromWarehouse" });
    StockTransfer.belongsTo(CompanyWarehouse, { foreignKey: "to_warehouse_id", as: "toWarehouse" });
    CompanyWarehouse.hasMany(StockTransfer, { foreignKey: "from_warehouse_id", as: "outgoingTransfers" });
    CompanyWarehouse.hasMany(StockTransfer, { foreignKey: "to_warehouse_id", as: "incomingTransfers" });
  }
  if (StockTransfer && User) {
    StockTransfer.belongsTo(User, { foreignKey: "requested_by", as: "requestedBy" });
    StockTransfer.belongsTo(User, { foreignKey: "approved_by", as: "approvedBy" });
    User.hasMany(StockTransfer, { foreignKey: "requested_by", as: "requestedStockTransfers" });
    User.hasMany(StockTransfer, { foreignKey: "approved_by", as: "approvedStockTransfers" });
  }
  if (StockTransfer && StockTransferItem) {
    StockTransfer.hasMany(StockTransferItem, { foreignKey: "stock_transfer_id", as: "items" });
    StockTransferItem.belongsTo(StockTransfer, { foreignKey: "stock_transfer_id", as: "stockTransfer" });
  }
  if (StockTransferItem && Product) {
    StockTransferItem.belongsTo(Product, { foreignKey: "product_id", as: "product" });
    Product.hasMany(StockTransferItem, { foreignKey: "product_id", as: "stockTransferItems" });
  }
  if (StockTransferItem && StockTransferSerial) {
    StockTransferItem.hasMany(StockTransferSerial, { foreignKey: "stock_transfer_item_id", as: "serials" });
    StockTransferSerial.belongsTo(StockTransferItem, { foreignKey: "stock_transfer_item_id", as: "stockTransferItem" });
  }
  if (StockTransferSerial && StockSerial) {
    StockTransferSerial.belongsTo(StockSerial, { foreignKey: "stock_serial_id", as: "stockSerial" });
    StockSerial.hasMany(StockTransferSerial, { foreignKey: "stock_serial_id", as: "stockTransferSerials" });
  }

  // Stock Adjustment associations
  if (StockAdjustment && CompanyWarehouse) {
    StockAdjustment.belongsTo(CompanyWarehouse, { foreignKey: "warehouse_id", as: "warehouse" });
    CompanyWarehouse.hasMany(StockAdjustment, { foreignKey: "warehouse_id", as: "stockAdjustments" });
  }
  if (StockAdjustment && User) {
    StockAdjustment.belongsTo(User, { foreignKey: "requested_by", as: "requestedBy" });
    StockAdjustment.belongsTo(User, { foreignKey: "approved_by", as: "approvedBy" });
    User.hasMany(StockAdjustment, { foreignKey: "requested_by", as: "requestedStockAdjustments" });
    User.hasMany(StockAdjustment, { foreignKey: "approved_by", as: "approvedStockAdjustments" });
  }
  if (StockAdjustment && StockAdjustmentItem) {
    StockAdjustment.hasMany(StockAdjustmentItem, { foreignKey: "stock_adjustment_id", as: "items" });
    StockAdjustmentItem.belongsTo(StockAdjustment, { foreignKey: "stock_adjustment_id", as: "stockAdjustment" });
  }
  if (StockAdjustmentItem && Product) {
    StockAdjustmentItem.belongsTo(Product, { foreignKey: "product_id", as: "product" });
    Product.hasMany(StockAdjustmentItem, { foreignKey: "product_id", as: "stockAdjustmentItems" });
  }
  if (StockAdjustmentItem && StockAdjustmentSerial) {
    StockAdjustmentItem.hasMany(StockAdjustmentSerial, { foreignKey: "stock_adjustment_item_id", as: "serials" });
    StockAdjustmentSerial.belongsTo(StockAdjustmentItem, { foreignKey: "stock_adjustment_item_id", as: "stockAdjustmentItem" });
  }
  if (StockAdjustmentSerial && StockSerial) {
    StockAdjustmentSerial.belongsTo(StockSerial, { foreignKey: "stock_serial_id", as: "stockSerial" });
    StockSerial.hasMany(StockAdjustmentSerial, { foreignKey: "stock_serial_id", as: "stockAdjustmentSerials" });
  }

  // Challan associations
  if (Challan && Order) {
    Challan.belongsTo(Order, { foreignKey: "order_id", as: "order" });
    Order.hasMany(Challan, { foreignKey: "order_id", as: "challans" });
  }
  if (Challan && CompanyWarehouse) {
    Challan.belongsTo(CompanyWarehouse, { foreignKey: "warehouse_id", as: "warehouse" });
    CompanyWarehouse.hasMany(Challan, { foreignKey: "warehouse_id", as: "challans" });
  }
  if (Challan && ChallanItems) {
    Challan.hasMany(ChallanItems, { foreignKey: "challan_id", as: "items" });
    ChallanItems.belongsTo(Challan, { foreignKey: "challan_id", as: "challan" });
  }

  // ChallanItems associations
  if (ChallanItems && Product) {
    ChallanItems.belongsTo(Product, { foreignKey: "product_id", as: "product" });
    Product.hasMany(ChallanItems, { foreignKey: "product_id", as: "challanItems" });
  }

  // Fabrication associations (one per order)
  if (Order && Fabrication) {
    Order.hasOne(Fabrication, { foreignKey: "order_id", as: "fabrication" });
    Fabrication.belongsTo(Order, { foreignKey: "order_id", as: "order" });
  }
  if (Fabrication && User) {
    Fabrication.belongsTo(User, { foreignKey: "fabricator_id", as: "fabricator" });
    User.hasMany(Fabrication, { foreignKey: "fabricator_id", as: "fabrications" });
  }

  // Installation associations (one per order)
  if (Order && Installation) {
    Order.hasOne(Installation, { foreignKey: "order_id", as: "installation" });
    Installation.belongsTo(Order, { foreignKey: "order_id", as: "order" });
  }
  if (Installation && User) {
    Installation.belongsTo(User, { foreignKey: "installer_id", as: "installer" });
    User.hasMany(Installation, { foreignKey: "installer_id", as: "installations" });
  }

  const ensureAuditAssociations = (Model) => {
    if (!Model || Model === User) return;
    const rawAttributes = Model.rawAttributes || {};
    const associations = Object.values(Model.associations || {});

    const hasAssociationForKey = (foreignKey) =>
      associations.some((assoc) => assoc.foreignKey === foreignKey);

    if (rawAttributes.created_by && !hasAssociationForKey("created_by")) {
      Model.belongsTo(User, { foreignKey: "created_by", as: "createdByUser" });
    }

    if (rawAttributes.updated_by && !hasAssociationForKey("updated_by")) {
      Model.belongsTo(User, { foreignKey: "updated_by", as: "updatedByUser" });
    }
  };

  if (User) {
    Object.values(db).forEach(ensureAuditAssociations);
  }

};
