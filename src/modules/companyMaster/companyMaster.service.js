const { Op } = require("sequelize");
const db = require("../../models/index.js");
const AppError = require("../../common/errors/AppError.js");
const { RESPONSE_STATUS_CODES } = require("../../common/utils/constants.js");

const Company = db.Company;
const CompanyBankAccount = db.CompanyBankAccount;
const CompanyBranch = db.CompanyBranch;
const CompanyWarehouse = db.CompanyWarehouse;

const getCompanyProfile = async (transaction = null) => {
  // Get the first company (assuming single company setup)
  // If multiple companies, you might want to add company_id parameter
  const company = await Company.findOne({
    where: { deleted_at: null },
    include: [
      {
        model: CompanyBankAccount,
        as: "bankAccounts",
        where: { deleted_at: null },
        required: false,
      },
    ],
    order: [["created_at", "DESC"]],
    transaction,
  });

  if (!company) {
    // Return empty structure if no company exists
    return {
      id: null,
      company_code: "",
      company_name: "",
      logo: null,
      header: null,
      footer: null,
      stamp: null,
      owner_name: "",
      owner_number: "",
      owner_email: "",
      address: "",
      city: "",
      state: "",
      contact_number: "",
      company_email: "",
      company_website: "",
      user_limit_used: 0,
      user_limit_total: 0,
      plan_valid_till: null,
      sms_credit_used: 0,
      sms_credit_total: 0,
      status: "active",
      bankAccounts: [],
    };
  }

  return company.toJSON();
};

const updateCompanyProfile = async (payload, transaction = null) => {
  // Validation: Check required fields
  const requiredFields = {
    company_name: "Company Name",
    company_code: "Company Code",
    address: "Address",
    city: "City",
    state: "State",
    company_email: "Company Email",
    contact_number: "Contact Number",
  };

  const missingFields = [];
  Object.keys(requiredFields).forEach((field) => {
    const value = payload[field];
    if (!value || (typeof value === "string" && value.trim() === "")) {
      missingFields.push(requiredFields[field]);
    }
  });

  if (missingFields.length > 0) {
    throw new AppError(
      `Please fill in the following required fields: ${missingFields.join(", ")}`,
      RESPONSE_STATUS_CODES.BAD_REQUEST
    );
  }

  // Check if company exists
  let company = await Company.findOne({
    where: { deleted_at: null },
    order: [["created_at", "DESC"]],
    transaction,
  });

  if (company) {
    // Update existing company
    const updatePayload = {
      company_code: payload.company_code,
      company_name: payload.company_name,
      logo: payload.logo !== undefined ? payload.logo : company.logo,
      owner_name: payload.owner_name !== undefined ? payload.owner_name : company.owner_name,
      owner_number: payload.owner_number !== undefined ? payload.owner_number : company.owner_number,
      owner_email: payload.owner_email !== undefined ? payload.owner_email : company.owner_email,
      address: payload.address,
      city: payload.city,
      state: payload.state,
      contact_number: payload.contact_number,
      company_email: payload.company_email,
      company_website: payload.company_website !== undefined ? payload.company_website : company.company_website,
      status: payload.status !== undefined ? payload.status : company.status,
      updated_at: new Date(),
    };

    await company.update(updatePayload, { transaction });
    return company.toJSON();
  } else {
    // Create new company - validation already done above
    
    // Check if company_code already exists
    const existing = await Company.findOne({
      where: { company_code: payload.company_code, deleted_at: null },
      transaction,
    });
    if (existing) {
      throw new AppError("Company code already exists", RESPONSE_STATUS_CODES.BAD_REQUEST);
    }

    const createPayload = {
      company_code: payload.company_code,
      company_name: payload.company_name,
      logo: payload.logo || null,
      owner_name: payload.owner_name || null,
      owner_number: payload.owner_number || null,
      owner_email: payload.owner_email || null,
      address: payload.address,
      city: payload.city,
      state: payload.state,
      contact_number: payload.contact_number,
      company_email: payload.company_email,
      company_website: payload.company_website || null,
      status: payload.status || "active",
    };

    company = await Company.create(createPayload, { transaction });
    return company.toJSON();
  }
};

const createBankAccount = async (payload, transaction = null) => {
  // Get company
  const company = await Company.findOne({
    where: { deleted_at: null },
    order: [["created_at", "DESC"]],
    transaction,
  });

  if (!company) {
    throw new AppError("Company not found. Please create company profile first.", RESPONSE_STATUS_CODES.NOT_FOUND);
  }

  if (!payload.bank_name || !payload.bank_account_name || !payload.bank_account_number) {
    throw new AppError("Bank name, account name, and account number are required", RESPONSE_STATUS_CODES.BAD_REQUEST);
  }

  // Validation: Cannot set inactive account as default
  const isActive = payload.is_active !== undefined ? payload.is_active : true;
  const isDefault = payload.is_default !== undefined ? payload.is_default : false;
  
  if (isDefault === true && isActive === false) {
    throw new AppError(
      "You must activate the account first before setting it as default",
      RESPONSE_STATUS_CODES.BAD_REQUEST
    );
  }

  // If setting as default, unset other default accounts for this company
  if (isDefault === true) {
    await CompanyBankAccount.update(
      { is_default: false },
      {
        where: { company_id: company.id, deleted_at: null },
        transaction,
      }
    );
  }

  const createPayload = {
    company_id: company.id,
    bank_name: payload.bank_name,
    bank_account_name: payload.bank_account_name,
    bank_account_number: payload.bank_account_number,
    bank_account_ifsc: payload.bank_account_ifsc || null,
    bank_account_branch: payload.bank_account_branch || null,
    is_active: isActive,
    is_default: isDefault,
  };

  const bankAccount = await CompanyBankAccount.create(createPayload, { transaction });
  return bankAccount.toJSON();
};

const updateBankAccount = async (id, payload, transaction = null) => {
  const bankAccount = await CompanyBankAccount.findOne({
    where: { id, deleted_at: null },
    transaction,
  });

  if (!bankAccount) {
    throw new AppError("Bank account not found", RESPONSE_STATUS_CODES.NOT_FOUND);
  }

  // Determine final values (use payload if provided, otherwise keep existing)
  const isActive = payload.is_active !== undefined ? payload.is_active : bankAccount.is_active;
  const isDefault = payload.is_default !== undefined ? payload.is_default : bankAccount.is_default;

  // Validation: Cannot set inactive account as default
  if (isDefault === true && isActive === false) {
    throw new AppError(
      "You must activate the account first before setting it as default",
      RESPONSE_STATUS_CODES.BAD_REQUEST
    );
  }

  // If setting as default, unset other default accounts for this company (excluding current one)
  if (isDefault === true && bankAccount.is_default !== true) {
    await CompanyBankAccount.update(
      { is_default: false },
      {
        where: {
          company_id: bankAccount.company_id,
          id: { [Op.ne]: id },
          deleted_at: null,
        },
        transaction,
      }
    );
  }

  const updatePayload = {
    bank_name: payload.bank_name !== undefined ? payload.bank_name : bankAccount.bank_name,
    bank_account_name: payload.bank_account_name !== undefined ? payload.bank_account_name : bankAccount.bank_account_name,
    bank_account_number: payload.bank_account_number !== undefined ? payload.bank_account_number : bankAccount.bank_account_number,
    bank_account_ifsc: payload.bank_account_ifsc !== undefined ? payload.bank_account_ifsc : bankAccount.bank_account_ifsc,
    bank_account_branch: payload.bank_account_branch !== undefined ? payload.bank_account_branch : bankAccount.bank_account_branch,
    is_active: isActive,
    is_default: isDefault,
    updated_at: new Date(),
  };

  await bankAccount.update(updatePayload, { transaction });
  return bankAccount.toJSON();
};

const deleteBankAccount = async (id, transaction = null) => {
  const bankAccount = await CompanyBankAccount.findOne({
    where: { id, deleted_at: null },
    transaction,
  });

  if (!bankAccount) {
    throw new AppError("Bank account not found", RESPONSE_STATUS_CODES.NOT_FOUND);
  }

  // Validation: Cannot delete default account
  if (bankAccount.is_default === true) {
    throw new AppError(
      "Cannot deactivate the default bank account. Please set another account as default first.",
      RESPONSE_STATUS_CODES.BAD_REQUEST
    );
  }

  // Mark as inactive instead of deleting
  await bankAccount.update(
    { is_active: false, updated_at: new Date() },
    { transaction }
  );
  return true;
};

const listBankAccounts = async (transaction = null) => {
  // Get company
  const company = await Company.findOne({
    where: { deleted_at: null },
    order: [["created_at", "DESC"]],
    transaction,
  });

  if (!company) {
    return [];
  }

  const bankAccounts = await CompanyBankAccount.findAll({
    where: { company_id: company.id, deleted_at: null, is_active: true },
    order: [
      ["is_default", "DESC"], // Default accounts first
      ["created_at", "DESC"],
    ],
    transaction,
  });

  return bankAccounts.map((ba) => ba.toJSON());
};

// Branch Methods
const createBranch = async (payload, transaction = null) => {
  // Get company
  const company = await Company.findOne({
    where: { deleted_at: null },
    order: [["created_at", "DESC"]],
    transaction,
  });

  if (!company) {
    throw new AppError("Company not found", RESPONSE_STATUS_CODES.NOT_FOUND);
  }

  // Validation: Required fields
  if (!payload.name || !payload.address || !payload.email || !payload.contact_no || !payload.gst_number) {
    throw new AppError(
      "Name, address, email, contact number, and GST number are required",
      RESPONSE_STATUS_CODES.BAD_REQUEST
    );
  }

  // Check if this is the first branch for the company
  const existingBranches = await CompanyBranch.count({
    where: { company_id: company.id, deleted_at: null },
    transaction,
  });

  // Determine if_default value
  // If it's the first branch, automatically set as default
  // Otherwise, use the payload value (default to false if not provided)
  const isDefault = existingBranches === 0 ? true : (payload.is_default !== undefined ? payload.is_default : false);
  const isActive = payload.is_active !== undefined ? payload.is_active : true;

  // Validation: Cannot set inactive branch as default
  if (isDefault === true && isActive === false) {
    throw new AppError(
      "You must activate the branch first before setting it as default",
      RESPONSE_STATUS_CODES.BAD_REQUEST
    );
  }

  // If setting as default, unset other default branches for this company
  if (isDefault === true) {
    await CompanyBranch.update(
      { is_default: false },
      {
        where: { company_id: company.id, deleted_at: null },
        transaction,
      }
    );
  }

  const createPayload = {
    company_id: company.id,
    name: payload.name,
    address: payload.address,
    email: payload.email,
    contact_no: payload.contact_no,
    gst_number: payload.gst_number,
    is_active: isActive,
    is_default: isDefault,
  };

  const branch = await CompanyBranch.create(createPayload, { transaction });
  return branch.toJSON();
};

const updateBranch = async (id, payload, transaction = null) => {
  const branch = await CompanyBranch.findOne({
    where: { id, deleted_at: null },
    transaction,
  });

  if (!branch) {
    throw new AppError("Branch not found", RESPONSE_STATUS_CODES.NOT_FOUND);
  }

  // Validation: Required fields
  if (payload.name !== undefined && !payload.name.trim()) {
    throw new AppError("Name is required", RESPONSE_STATUS_CODES.BAD_REQUEST);
  }
  if (payload.address !== undefined && !payload.address.trim()) {
    throw new AppError("Address is required", RESPONSE_STATUS_CODES.BAD_REQUEST);
  }
  if (payload.email !== undefined && !payload.email.trim()) {
    throw new AppError("Email is required", RESPONSE_STATUS_CODES.BAD_REQUEST);
  }
  if (payload.contact_no !== undefined && !payload.contact_no.trim()) {
    throw new AppError("Contact number is required", RESPONSE_STATUS_CODES.BAD_REQUEST);
  }
  if (payload.gst_number !== undefined && !payload.gst_number.trim()) {
    throw new AppError("GST number is required", RESPONSE_STATUS_CODES.BAD_REQUEST);
  }

  // Determine final values (use payload if provided, otherwise keep existing)
  const isActive = payload.is_active !== undefined ? payload.is_active : branch.is_active;
  const isDefault = payload.is_default !== undefined ? payload.is_default : branch.is_default;

  // Validation: Cannot set inactive branch as default
  if (isDefault === true && isActive === false) {
    throw new AppError(
      "You must activate the branch first before setting it as default",
      RESPONSE_STATUS_CODES.BAD_REQUEST
    );
  }

  // Check if this is the only branch
  const branchCount = await CompanyBranch.count({
    where: { company_id: branch.company_id, deleted_at: null },
    transaction,
  });

  // Validation: Cannot unset default if it's the only branch
  if (isDefault === false && branchCount === 1 && branch.is_default === true) {
    throw new AppError(
      "Cannot unset default branch. At least one branch must be set as default.",
      RESPONSE_STATUS_CODES.BAD_REQUEST
    );
  }

  // If setting as default, unset other default branches for this company (excluding current one)
  if (isDefault === true && branch.is_default !== true) {
    await CompanyBranch.update(
      { is_default: false },
      {
        where: {
          company_id: branch.company_id,
          id: { [Op.ne]: id },
          deleted_at: null,
        },
        transaction,
      }
    );
  }

  const updatePayload = {
    name: payload.name !== undefined ? payload.name : branch.name,
    address: payload.address !== undefined ? payload.address : branch.address,
    email: payload.email !== undefined ? payload.email : branch.email,
    contact_no: payload.contact_no !== undefined ? payload.contact_no : branch.contact_no,
    gst_number: payload.gst_number !== undefined ? payload.gst_number : branch.gst_number,
    is_active: isActive,
    is_default: isDefault,
    updated_at: new Date(),
  };

  await branch.update(updatePayload, { transaction });
  return branch.toJSON();
};

const deleteBranch = async (id, transaction = null) => {
  const branch = await CompanyBranch.findOne({
    where: { id, deleted_at: null },
    transaction,
  });

  if (!branch) {
    throw new AppError("Branch not found", RESPONSE_STATUS_CODES.NOT_FOUND);
  }

  // Check if this is the only branch
  const branchCount = await CompanyBranch.count({
    where: { company_id: branch.company_id, deleted_at: null },
    transaction,
  });

  if (branchCount === 1) {
    throw new AppError(
      "Cannot delete the only branch. At least one branch is required.",
      RESPONSE_STATUS_CODES.BAD_REQUEST
    );
  }

  // Validation: Cannot delete default branch
  if (branch.is_default === true) {
    throw new AppError(
      "Cannot delete the default branch. Please set another branch as default first.",
      RESPONSE_STATUS_CODES.BAD_REQUEST
    );
  }

  // Mark as inactive instead of deleting
  await branch.update(
    { is_active: false, updated_at: new Date() },
    { transaction }
  );
  return true;
};

const listBranches = async (transaction = null) => {
  // Get company
  const company = await Company.findOne({
    where: { deleted_at: null },
    order: [["created_at", "DESC"]],
    transaction,
  });

  if (!company) {
    return [];
  }

  const branches = await CompanyBranch.findAll({
    where: { company_id: company.id, deleted_at: null, is_active: true },
    order: [
      ["is_default", "DESC"], // Default branches first
      ["created_at", "DESC"],
    ],
    transaction,
  });

  return branches.map((branch) => branch.toJSON());
};

const getDefaultBranch = async (transaction = null) => {
  // Get company
  const company = await Company.findOne({
    where: { deleted_at: null },
    order: [["created_at", "DESC"]],
    transaction,
  });

  if (!company) {
    return null;
  }

  const defaultBranch = await CompanyBranch.findOne({
    where: { company_id: company.id, deleted_at: null, is_default: true, is_active: true },
    transaction,
  });

  return defaultBranch ? defaultBranch.toJSON() : null;
};

// Warehouse Methods
const createWarehouse = async (payload, transaction = null) => {
  // Get company
  const company = await Company.findOne({
    where: { deleted_at: null },
    order: [["created_at", "DESC"]],
    transaction,
  });

  if (!company) {
    throw new AppError("Company not found", RESPONSE_STATUS_CODES.NOT_FOUND);
  }

  // Validation: Required fields
  if (!payload.name || !payload.mobile || !payload.state_id || !payload.address) {
    throw new AppError(
      "Name, mobile, state, and address are required",
      RESPONSE_STATUS_CODES.BAD_REQUEST
    );
  }

  const createPayload = {
    company_id: company.id,
    name: payload.name,
    contact_person: payload.contact_person || null,
    mobile: payload.mobile,
    state_id: payload.state_id,
    email: payload.email || null,
    phone_no: payload.phone_no || null,
    address: payload.address,
    is_active: payload.is_active !== undefined ? payload.is_active : true,
  };

  const warehouse = await CompanyWarehouse.create(createPayload, { transaction });
  return warehouse.toJSON();
};

const updateWarehouse = async (id, payload, transaction = null) => {
  const warehouse = await CompanyWarehouse.findOne({
    where: { id, deleted_at: null },
    transaction,
  });

  if (!warehouse) {
    throw new AppError("Warehouse not found", RESPONSE_STATUS_CODES.NOT_FOUND);
  }

  // Validation: Required fields
  if (payload.name !== undefined && !payload.name.trim()) {
    throw new AppError("Name is required", RESPONSE_STATUS_CODES.BAD_REQUEST);
  }
  if (payload.mobile !== undefined && !payload.mobile.trim()) {
    throw new AppError("Mobile is required", RESPONSE_STATUS_CODES.BAD_REQUEST);
  }
  if (payload.state_id !== undefined && !payload.state_id) {
    throw new AppError("State is required", RESPONSE_STATUS_CODES.BAD_REQUEST);
  }
  if (payload.address !== undefined && !payload.address.trim()) {
    throw new AppError("Address is required", RESPONSE_STATUS_CODES.BAD_REQUEST);
  }

  const updatePayload = {
    name: payload.name !== undefined ? payload.name : warehouse.name,
    contact_person: payload.contact_person !== undefined ? payload.contact_person : warehouse.contact_person,
    mobile: payload.mobile !== undefined ? payload.mobile : warehouse.mobile,
    state_id: payload.state_id !== undefined ? payload.state_id : warehouse.state_id,
    email: payload.email !== undefined ? payload.email : warehouse.email,
    phone_no: payload.phone_no !== undefined ? payload.phone_no : warehouse.phone_no,
    address: payload.address !== undefined ? payload.address : warehouse.address,
    is_active: payload.is_active !== undefined ? payload.is_active : warehouse.is_active,
    updated_at: new Date(),
  };

  await warehouse.update(updatePayload, { transaction });
  return warehouse.toJSON();
};

const deleteWarehouse = async (id, transaction = null) => {
  const warehouse = await CompanyWarehouse.findOne({
    where: { id, deleted_at: null },
    transaction,
  });

  if (!warehouse) {
    throw new AppError("Warehouse not found", RESPONSE_STATUS_CODES.NOT_FOUND);
  }

  // Mark as inactive instead of deleting
  await warehouse.update(
    { is_active: false, updated_at: new Date() },
    { transaction }
  );
  return true;
};

const listWarehouses = async (companyId = null, transaction = null) => {
  let company;
  
  // If company_id is provided, use it; otherwise get the first company
  if (companyId) {
    company = await Company.findOne({
      where: { id: companyId, deleted_at: null },
      transaction,
    });
  } else {
    // Get company (fallback to first company if no company_id provided)
    company = await Company.findOne({
      where: { deleted_at: null },
      order: [["created_at", "DESC"]],
      transaction,
    });
  }

  if (!company) {
    return [];
  }

  const warehouses = await CompanyWarehouse.findAll({
    where: { company_id: company.id, deleted_at: null, is_active: true },
    include: [
      {
        model: db.State,
        as: "state",
        attributes: ["id", "name"],
        required: false,
      },
      {
        model: db.User,
        as: "managers",
        attributes: ["id", "name", "email"],
        required: false,
        through: { attributes: [] },
      },
    ],
    order: [["created_at", "DESC"]],
    transaction,
  });

  return warehouses.map((warehouse) => {
    const warehouseData = warehouse.toJSON();
    // Include state name in the response
    if (warehouseData.state) {
      warehouseData.state_name = warehouseData.state.name;
    }
    // managers array is already included from include
    return warehouseData;
  });
};

const getWarehouseManagers = async (warehouseId, transaction = null) => {
  const warehouse = await CompanyWarehouse.findOne({
    where: { id: warehouseId, deleted_at: null },
    include: [
      {
        model: db.User,
        as: "managers",
        attributes: ["id", "name", "email"],
        required: false,
        through: { attributes: [] },
      },
    ],
    transaction,
  });

  if (!warehouse) {
    throw new AppError("Warehouse not found", RESPONSE_STATUS_CODES.NOT_FOUND);
  }

  const warehouseData = warehouse.toJSON();
  return warehouseData.managers || [];
};

const setWarehouseManagers = async (warehouseId, userIds = [], transaction = null) => {
  const warehouse = await CompanyWarehouse.findOne({
    where: { id: warehouseId, deleted_at: null },
    transaction,
  });

  if (!warehouse) {
    throw new AppError("Warehouse not found", RESPONSE_STATUS_CODES.NOT_FOUND);
  }

  // Normalize to unique integers
  const uniqueIds = [...new Set((userIds || []).map((id) => parseInt(id, 10)).filter((id) => !Number.isNaN(id) && id > 0))];

  await warehouse.setManagers(uniqueIds, { transaction });
  return true;
};

// Image Management Methods
const uploadCompanyImage = async (imageType, filePath, transaction = null) => {
  // Get company
  const company = await Company.findOne({
    where: { deleted_at: null },
    order: [["created_at", "DESC"]],
    transaction,
  });

  if (!company) {
    throw new AppError("Company not found", RESPONSE_STATUS_CODES.NOT_FOUND);
  }

  // Validate image type
  const validImageTypes = ["logo", "header", "footer", "stamp"];
  if (!validImageTypes.includes(imageType)) {
    throw new AppError(
      `Invalid image type. Valid types are: ${validImageTypes.join(", ")}`,
      RESPONSE_STATUS_CODES.BAD_REQUEST
    );
  }

  // Store old file path to delete it later
  const oldFilePath = company[imageType];

  // Update the company with new image path
  const updatePayload = {
    [imageType]: filePath,
    updated_at: new Date(),
  };

  await company.update(updatePayload, { transaction });

  // Return updated company
  const updatedCompany = await Company.findOne({
    where: { id: company.id, deleted_at: null },
    transaction,
  });

  return {
    imageType,
    imagePath: updatedCompany[imageType],
    oldImagePath: oldFilePath, // Return old path so controller can delete it
    company: updatedCompany.toJSON(),
  };
};

const deleteCompanyImage = async (imageType, transaction = null) => {
  // Get company
  const company = await Company.findOne({
    where: { deleted_at: null },
    order: [["created_at", "DESC"]],
    transaction,
  });

  if (!company) {
    throw new AppError("Company not found", RESPONSE_STATUS_CODES.NOT_FOUND);
  }

  // Validate image type
  const validImageTypes = ["logo", "header", "footer", "stamp"];
  if (!validImageTypes.includes(imageType)) {
    throw new AppError(
      `Invalid image type. Valid types are: ${validImageTypes.join(", ")}`,
      RESPONSE_STATUS_CODES.BAD_REQUEST
    );
  }

  // Store old file path to delete it
  const oldFilePath = company[imageType];

  if (!oldFilePath) {
    throw new AppError(`${imageType} image not found`, RESPONSE_STATUS_CODES.NOT_FOUND);
  }

  // Update the company to remove image path
  const updatePayload = {
    [imageType]: null,
    updated_at: new Date(),
  };

  await company.update(updatePayload, { transaction });

  return {
    imageType,
    deletedImagePath: oldFilePath, // Return deleted path so controller can delete file
    company: company.toJSON(),
  };
};

// Export all functions
module.exports = {
  getCompanyProfile,
  updateCompanyProfile,
  createBankAccount,
  updateBankAccount,
  deleteBankAccount,
  listBankAccounts,
  createBranch,
  updateBranch,
  deleteBranch,
  listBranches,
  getDefaultBranch,
  createWarehouse,
  updateWarehouse,
  deleteWarehouse,
  listWarehouses,
  getWarehouseManagers,
  setWarehouseManagers,
  uploadCompanyImage,
  deleteCompanyImage,
};

