/**
 * Script to assign icons to existing modules based on their names
 * Run with: node scripts/assign-icons-to-modules.js
 */

require("dotenv").config();
const db = require("../src/models/index.js");

// Icon mapping based on module names/keys
const iconMapping = {
  // Parent modules
  home: "home",
  task_planner: "calendar",
  "task-planner": "calendar",
  marketing_leads: "leads",
  "marketing-leads": "leads",
  inquiry_management: "inquiry",
  "inquiry-management": "inquiry",
  order_management: "order",
  "order-management": "order",
  execution_planner: "execution",
  "execution-planner": "execution",
  add_quick_service: "quick_service",
  "add-quick-service": "quick_service",
  procurement: "procurement",
  settings: "settings",
  
  // Child modules
  users_master: "users",
  "users-master": "users",
  user_master: "users",
  "user-master": "users",
  roles: "roles",
  role_master: "roles",
  "role-master": "roles",
  modules: "modules",
  module_master: "modules",
  "module-master": "modules",
  role_modules: "role_modules",
  "role-modules": "role_modules",
  role_module: "role_modules",
  "role-module": "role_modules",
  
  // Inquiry Management
  inquiry: "inquiry",
  site_visit: "site_visit",
  "site-visit": "site_visit",
  followup: "followup",
  
  // Settings
  masters: "masters",
  company_profile: "company_profile",
  "company-profile": "company_profile",
  
  // Procurement
  product: "product",
  bill_of_materials: "bill_of_materials",
  "bill-of-materials": "bill_of_materials",
  bill_of_material: "bill_of_materials",
  "bill-of-material": "bill_of_materials",
  project_price_list: "project_price",
  "project-price-list": "project_price",
  project_price: "project_price",
  "project-price": "project_price",
  
  // Other
  quotation: "quotation",
  
  // Inventory Management
  inventory_management: "inventory",
  "inventory-management": "inventory",
  supplier_master: "supplier",
  "supplier-master": "supplier",
  supplier: "supplier",
  purchase_orders: "purchase_order",
  "purchase-orders": "purchase_order",
  purchase_order: "purchase_order",
  po_inwards: "goods_receipt",
  "po-inwards": "goods_receipt",
  po_inward: "goods_receipt",
  "po-inward": "goods_receipt",
  stock_management: "stock",
  "stock-management": "stock",
  stocks: "stock",
  stock: "stock",
  stock_transfers: "transfer",
  "stock-transfers": "stock_transfer",
  stock_transfer: "transfer",
  "stock-transfer": "transfer",
  stock_adjustments: "adjustment",
  "stock-adjustments": "adjustment",
  stock_adjustment: "adjustment",
  "stock-adjustment": "adjustment",
  inventory_ledger: "ledger",
  "inventory-ledger": "inventory_ledger",
};

/**
 * Get icon name based on module name or key
 */
function getIconForModule(name, key) {
  // Try key first (more specific)
  const keyLower = key?.toLowerCase().trim();
  if (keyLower && iconMapping[keyLower]) {
    return iconMapping[keyLower];
  }
  
  // Try name
  const nameLower = name?.toLowerCase().trim();
  if (nameLower) {
    // Direct match
    if (iconMapping[nameLower]) {
      return iconMapping[nameLower];
    }
    
    // Partial matches
    if (nameLower.includes("user") && nameLower.includes("master")) {
      return "users";
    }
    if (nameLower.includes("role") && nameLower.includes("master")) {
      return "roles";
    }
    if (nameLower.includes("module") && nameLower.includes("master")) {
      return "modules";
    }
    if (nameLower.includes("role") && nameLower.includes("module")) {
      return "role_modules";
    }
    if (nameLower.includes("inquiry")) {
      return "inquiry";
    }
    if (nameLower.includes("site") && nameLower.includes("visit")) {
      return "site_visit";
    }
    if (nameLower.includes("followup") || nameLower.includes("follow-up")) {
      return "followup";
    }
    if (nameLower.includes("master")) {
      return "masters";
    }
    if (nameLower.includes("company") && nameLower.includes("profile")) {
      return "company_profile";
    }
    if (nameLower.includes("product")) {
      return "product";
    }
    if (nameLower.includes("bill") && nameLower.includes("material")) {
      return "bill_of_materials";
    }
    if (nameLower.includes("project") && nameLower.includes("price")) {
      return "project_price";
    }
    if (nameLower.includes("quotation")) {
      return "quotation";
    }
    if (nameLower.includes("home")) {
      return "home";
    }
    if (nameLower.includes("task") && nameLower.includes("planner")) {
      return "calendar";
    }
    if (nameLower.includes("marketing") && nameLower.includes("lead")) {
      return "leads";
    }
    if (nameLower.includes("order") && nameLower.includes("management")) {
      return "order";
    }
    if (nameLower.includes("execution") && nameLower.includes("planner")) {
      return "execution";
    }
    if (nameLower.includes("quick") && nameLower.includes("service")) {
      return "quick_service";
    }
    if (nameLower.includes("procurement")) {
      return "procurement";
    }
    if (nameLower.includes("setting")) {
      return "settings";
    }
    if (nameLower.includes("inventory") && nameLower.includes("management")) {
      return "inventory";
    }
    if (nameLower.includes("supplier")) {
      return "supplier";
    }
    if (nameLower.includes("purchase") && nameLower.includes("order")) {
      return "purchase_order";
    }
    if (nameLower.includes("po") && nameLower.includes("inward")) {
      return "goods_receipt";
    }
    if (nameLower.includes("stock") && nameLower.includes("management")) {
      return "stock";
    }
    if (nameLower.includes("stock") && nameLower.includes("transfer")) {
      return "transfer";
    }
    if (nameLower.includes("stock") && nameLower.includes("adjustment")) {
      return "adjustment";
    }
    if (nameLower.includes("inventory") && nameLower.includes("ledger")) {
      return "ledger";
    }
  }
  
  // Default fallback
  return "settings";
}

async function assignIcons() {
  try {
    console.log("🔄 Starting icon assignment process...\n");
    
    // Get all modules
    const modules = await db.Module.findAll({
      where: { deleted_at: null },
      attributes: ["id", "name", "key", "icon"],
    });
    
    console.log(`📦 Found ${modules.length} modules to process\n`);
    
    let updated = 0;
    let skipped = 0;
    
    for (const module of modules) {
      const currentIcon = module.icon;
      const suggestedIcon = getIconForModule(module.name, module.key);
      
      if (currentIcon && currentIcon.trim() !== "") {
        console.log(`⏭️  Skipping "${module.name}" (${module.key}) - already has icon: ${currentIcon}`);
        skipped++;
        continue;
      }
      
      console.log(`✨ Updating "${module.name}" (${module.key})`);
      console.log(`   Suggested icon: ${suggestedIcon}`);
      
      await module.update({ icon: suggestedIcon });
      updated++;
    }
    
    console.log("\n" + "=".repeat(50));
    console.log("✅ Icon assignment completed!");
    console.log(`   Updated: ${updated} modules`);
    console.log(`   Skipped: ${skipped} modules (already had icons)`);
    console.log("=".repeat(50));
    
  } catch (error) {
    console.error("❌ Error assigning icons:", error);
    throw error;
  } finally {
    await db.sequelize.close();
  }
}

// Run the script
if (require.main === module) {
  assignIcons()
    .then(() => {
      console.log("\n🎉 Script completed successfully!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("\n💥 Script failed:", error);
      process.exit(1);
    });
}

module.exports = { assignIcons, getIconForModule };

