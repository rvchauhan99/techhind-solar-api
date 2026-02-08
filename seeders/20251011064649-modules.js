"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    const now = new Date();

    // 1️⃣ Define PARENT modules (top level)
    const parentModules = [
      {
        name: "Home",
        key: "home",
        parent_id: null,
        icon: "home",
        route: "/home",
        status: "active",
      },
      {
        name: "Task Planner",
        key: "task_planner",
        parent_id: null,
        icon: "calendar",
        route: "/task-planner",
        status: "active",
      },
      {
        name: "Marketing Leads",
        key: "marketing_leads",
        parent_id: null,
        icon: "leads",
        route: "/marketing-leads",
        status: "active",
      },
      {
        name: "Inquiry Management",
        key: "inquiry_management",
        parent_id: null,
        icon: "inquiry",
        route: "/inquiry-management",
        status: "active",
      },
      {
        name: "Order Management",
        key: "order_management",
        parent_id: null,
        icon: "order",
        route: "/order-management",
        status: "active",
      },
      {
        name: "Execution Planner",
        key: "execution_planner",
        parent_id: null,
        icon: "execution",
        route: "/execution-planner",
        status: "active",
      },
      {
        name: "Add Quick Service",
        key: "add_quick_service",
        parent_id: null,
        icon: "quick_service",
        route: "/add-quick-service",
        status: "active",
      },
      {
        name: "Procurement",
        key: "procurement",
        parent_id: null,
        icon: "procurement",
        route: "/procurement",
        status: "active",
      },
      {
        name: "Settings",
        key: "settings",
        parent_id: null,
        icon: "settings",
        route: "/settings",
        status: "active",
      },
    ];

    // 2️⃣ Check if modules already exist and filter
    const [existingModules] = await queryInterface.sequelize.query(
      `SELECT key FROM modules WHERE deleted_at IS NULL`
    );
    const existingModuleKeys = existingModules.map((m) => m.key);

    const parentModulesToInsert = parentModules.filter(
      (m) => !existingModuleKeys.includes(m.key)
    );

    // 3️⃣ Add created/updated timestamps and auto sequence for parents
    if (parentModulesToInsert.length > 0) {
      // Get current max sequence or start from 1
      const [maxSeqResult] = await queryInterface.sequelize.query(
        `SELECT COALESCE(MAX(sequence), 0) as max_seq FROM modules WHERE deleted_at IS NULL`
      );
      const maxSeq = maxSeqResult[0]?.max_seq || 0;

      parentModulesToInsert.forEach((m, i) => {
        m.sequence = maxSeq + i + 1;
        m.created_at = now;
        m.updated_at = now;
      });

      // 4️⃣ Insert parent modules
      await queryInterface.bulkInsert("modules", parentModulesToInsert, {});
    }

    // 5️⃣ Fetch all parents (including existing ones) to get their IDs
    const [allParents] = await queryInterface.sequelize.query(`
      SELECT id, key FROM modules WHERE parent_id IS NULL AND deleted_at IS NULL;
    `);

    const parentMap = allParents.reduce((map, mod) => {
      map[mod.key] = mod.id;
      return map;
    }, {});

    // 6️⃣ Define CHILD modules
    const childModulesData = [
      {
        name: "Users Master",
        key: "users_master",
        parent_id: parentMap["settings"],
        icon: "users",
        route: "/user-master",
        status: "active",
      },
      {
        name: "Roles",
        key: "roles",
        parent_id: parentMap["settings"],
        icon: "roles",
        route: "/role-master",
        status: "active",
      },
      {
        name: "Modules",
        key: "modules",
        parent_id: parentMap["settings"],
        icon: "modules",
        route: "/module-master",
        status: "active",
      },
      {
        name: "Roles Modules",
        key: "role_modules",
        parent_id: parentMap["settings"],
        icon: "role-modules",
        route: "/role-module",
        status: "active",
      },
      {
        name: "Pending Orders",
        key: "pending_orders",
        parent_id: parentMap["order_management"],
        icon: "pending_orders",
        route: "/order",
        status: "active",
      },
      {
        name: "Confirm Orders",
        key: "confirm_orders",
        parent_id: parentMap["order_management"],
        icon: "confirm_orders",
        route: "/confirm-orders",
        status: "active",
      },
      {
        name: "Closed Orders",
        key: "closed_orders",
        parent_id: parentMap["order_management"],
        icon: "closed_orders",
        route: "/closed-orders",
        status: "active",
      },
      {
        name: "Inquiry",
        key: "inquiry",
        parent_id: parentMap["inquiry_management"],
        icon: "inquiry",
        route: "/inquiry",
        status: "active",
      },
      {
        name: "Site Visit",
        key: "site_visit",
        parent_id: parentMap["inquiry_management"],
        icon: "site_visit",
        route: "/site-visit",
        status: "active",
      },
      {
        name: "Followup",
        key: "followup",
        parent_id: parentMap["inquiry_management"],
        icon: "followup",
        route: "/followup",
        status: "active",
      },
      {
        name: "Masters",
        key: "masters",
        parent_id: parentMap["settings"],
        icon: "masters",
        route: "/masters",
        status: "active",
      },
      {
        name: "Company Profile",
        key: "company_profile",
        parent_id: parentMap["settings"],
        icon: "company_profile",
        route: "/company-profile",
        status: "active",
      },
      {
        name: "Product",
        key: "product",
        parent_id: parentMap["procurement"],
        icon: "product",
        route: "/product",
        status: "active",
      },
      {
        name: "Bill of Materials",
        key: "bill_of_materials",
        parent_id: parentMap["procurement"],
        icon: "bill_of_materials",
        route: "/bill-of-materials",
        status: "active",
      },
      {
        name: "Project Price List",
        key: "project_price_list",
        parent_id: parentMap["procurement"],
        icon: "project_price_list",
        route: "/project-price",
        status: "active"
      },
      {
        name: "Quotation",
        key: "quotation",
        parent_id: parentMap["inquiry_management"],
        icon: "quotation",
        route: "/quotation",
        status: "active"
      }
    ].filter((m) => !existingModuleKeys.includes(m.key));

    if (childModulesData.length > 0) {
      // Get current max sequence for children
      const [maxSeqResult] = await queryInterface.sequelize.query(
        `SELECT COALESCE(MAX(sequence), 0) as max_seq FROM modules WHERE deleted_at IS NULL`
      );
      const maxSeq = maxSeqResult[0]?.max_seq || 0;
      let seq = maxSeq + 1;

      const childModules = childModulesData.map((m) => ({
        ...m,
        sequence: seq++,
        created_at: now,
        updated_at: now,
      }));

      // 7️⃣ Insert all children
      await queryInterface.bulkInsert("modules", childModules, {});
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete("modules", null, {});
  },
};
