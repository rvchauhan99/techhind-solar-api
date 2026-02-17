const { Op } = require('sequelize');
const db = require('../../models/index.js');
const AppError = require('../../common/errors/AppError.js');
const { RESPONSE_STATUS_CODES } = require('../../common/utils/constants.js');
const modelDisplayFields = require('../../common/utils/modelDisplayFields.json');

/**
 * Helper function to get model by name
 * @param {string} model - Model name (e.g., "company.model")
 * @returns {Object} - Sequelize Model
 */
const getModelByName = (model) => {
    const raw = String(model || "").replace(/\.model$/i, "").trim();
    const normalize = (s) => String(s || "").replace(/[^a-z0-9]/gi, "").toLowerCase();

    // Build tolerant candidates for direct key lookup.
    const pascal = raw
        .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
        .split(/[-_/.\s]+/)
        .filter(Boolean)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join("");
    const camel = pascal ? pascal.charAt(0).toLowerCase() + pascal.slice(1) : "";

    const directCandidates = [...new Set([raw, pascal, camel].filter(Boolean))];
    for (const candidate of directCandidates) {
        if (db[candidate]) return db[candidate];
    }

    // Fuzzy match against db model keys (handles PurchaseOrder, POInward, etc.).
    const availableModels = Object.keys(db).filter((key) => !["sequelize", "Sequelize"].includes(key));
    const normalizedRaw = normalize(raw);
    const fuzzyKey = availableModels.find((key) => normalize(key) === normalizedRaw);
    if (fuzzyKey && db[fuzzyKey]) return db[fuzzyKey];

    throw new AppError(
        `Model "${pascal || raw}" not found. Available models: ${availableModels.join(", ")}`,
        RESPONSE_STATUS_CODES.NOT_FOUND
    );
};

const VISIBILITY_ACTIVE = 'active';
const VISIBILITY_INACTIVE = 'inactive';
const VISIBILITY_ALL = 'all';
const VALID_VISIBILITY = [VISIBILITY_ACTIVE, VISIBILITY_INACTIVE, VISIBILITY_ALL];

const STRING_OPS = ['contains', 'notContains', 'equals', 'notEquals', 'startsWith', 'endsWith'];
const NUMBER_OPS = ['equals', 'notEquals', 'gt', 'gte', 'lt', 'lte', 'between'];
const DATE_OPS = ['equals', 'before', 'after', 'inRange'];

const buildStringCond = (fieldName, value, op = 'contains') => {
    const val = String(value || '').trim();
    if (!val) return null;
    const safeOp = STRING_OPS.includes(op) ? op : 'contains';
    switch (safeOp) {
        case 'contains': return { [fieldName]: { [Op.iLike]: `%${val}%` } };
        case 'notContains': return { [fieldName]: { [Op.notILike]: `%${val}%` } };
        case 'equals': return { [fieldName]: { [Op.iLike]: val } };
        case 'notEquals': return { [fieldName]: { [Op.notILike]: val } };
        case 'startsWith': return { [fieldName]: { [Op.iLike]: `${val}%` } };
        case 'endsWith': return { [fieldName]: { [Op.iLike]: `%${val}` } };
        default: return { [fieldName]: { [Op.iLike]: `%${val}%` } };
    }
};

const buildNumberCond = (fieldName, value, op = 'equals', valueTo = null) => {
    const num = Number(value);
    if (value !== '' && value != null && Number.isNaN(num)) return null;
    if (value === '' || value == null) return null;
    const safeOp = NUMBER_OPS.includes(op) ? op : 'equals';
    switch (safeOp) {
        case 'equals': return { [fieldName]: num };
        case 'notEquals': return { [fieldName]: { [Op.ne]: num } };
        case 'gt': return { [fieldName]: { [Op.gt]: num } };
        case 'gte': return { [fieldName]: { [Op.gte]: num } };
        case 'lt': return { [fieldName]: { [Op.lt]: num } };
        case 'lte': return { [fieldName]: { [Op.lte]: num } };
        case 'between': {
            const to = valueTo !== '' && valueTo != null ? Number(valueTo) : null;
            if (to === null || Number.isNaN(to)) return { [fieldName]: { [Op.gte]: num } };
            return { [fieldName]: { [Op.between]: [num, to] } };
        }
        default: return { [fieldName]: num };
    }
};

const buildDateCond = (fieldName, value, op = 'equals', valueTo = null) => {
    if (value === '' || value == null) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    const safeOp = DATE_OPS.includes(op) ? op : 'equals';
    switch (safeOp) {
        case 'equals': return { [fieldName]: d };
        case 'before': return { [fieldName]: { [Op.lt]: d } };
        case 'after': return { [fieldName]: { [Op.gt]: d } };
        case 'inRange': {
            const to = valueTo !== '' && valueTo != null ? new Date(valueTo) : null;
            if (!to || Number.isNaN(to.getTime())) return { [fieldName]: { [Op.gte]: d } };
            return { [fieldName]: { [Op.between]: [d, to] } };
        }
        default: return { [fieldName]: d };
    }
};

/**
 * Generic function to get master list for any model
 * @param {Object} params - { model, page, limit, q, status, visibility, filters }
 * @param {string} [params.visibility] - 'active' (default) | 'inactive' | 'all' for soft-deleted filter
 * @param {Object} [params.filters] - query params for column filters (field names, field_op, field_to)
 * @returns {Object} - { fields, data, meta }
 */
const getMasterList = async ({ model, page = 1, limit = 20, q = null, status = null, visibility = null, filters = null } = {}) => {
    if (!model) {
        throw new AppError('Model name is required', RESPONSE_STATUS_CODES.BAD_REQUEST);
    }

    const Model = getModelByName(model);

    // Get master configuration from masters.json
    const mastersConfig = require('../../common/utils/masters.json');
    const masterConfig = mastersConfig.find(m => m.model_name === model);
    const fileUploadFields = masterConfig?.file_upload_fields || [];
    const multiSelectConfigs = masterConfig?.multiselect_fields || [];

    // Extract field definitions from the model
    const fields = [];
    const modelAttributes = Model.rawAttributes || {};

    Object.keys(modelAttributes).forEach((fieldName) => {
        const attribute = modelAttributes[fieldName];
        // Skip internal and audit fields (audit fields are set server-side from logged-in user)
        if (['created_at', 'updated_at', 'deleted_at', 'created_by', 'updated_by'].includes(fieldName)) {
            return;
        }

        const fieldDef = {
            name: fieldName,
            type: attribute.type?.key || attribute.type?.toString() || 'STRING',
            allowNull: attribute.allowNull !== false,
            primaryKey: attribute.primaryKey || false,
            autoIncrement: attribute.autoIncrement || false,
            defaultValue: attribute.defaultValue,
            unique: attribute.unique || false,
            isFileUpload: fileUploadFields.includes(fieldName), // Mark field as file upload if configured
        };

        // Check if this is a foreign key field (ends with _id or has references)
        if (fieldName.endsWith('_id') || attribute.references) {
            const refModel = attribute.references?.model;
            if (refModel) {
                // Extract model name from table name (e.g., "states" -> "State")
                const refModelName = refModel
                    .split('_')
                    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                    .join('');

                // Find the model file name
                const modelFiles = require('fs').readdirSync(require('path').join(__dirname, '../../models'))
                    .filter(f => f.endsWith('.model.js'));

                const refModelFile = modelFiles.find(f => {
                    const model = require(require('path').join(__dirname, '../../models', f));
                    return model.tableName === refModel || model.name === refModelName;
                });

                if (refModelFile) {
                    // Remove .js extension from filename for getModelByName compatibility
                    const modelNameForApi = refModelFile.replace(/\.js$/, '');

                    // Get display field configuration
                    const displayConfig = modelDisplayFields[modelNameForApi] || {};
                    const displayField = displayConfig.displayField || 'name';

                    fieldDef.reference = {
                        model: modelNameForApi,
                        modelName: refModelName,
                        tableName: refModel,
                        displayField: displayField, // Field to display in dropdown
                    };
                }
            }
        }

        fields.push(fieldDef);
    });

    // Inject configured multiselect fields (e.g., assign_to for planner_auto)
    if (Array.isArray(multiSelectConfigs) && multiSelectConfigs.length > 0) {
        multiSelectConfigs.forEach((cfg) => {
            if (!cfg || !cfg.name || !cfg.reference_model) return;

            // Determine display config for the referenced model
            const displayConfig = modelDisplayFields[cfg.reference_model] || {};
            const displayField = displayConfig.displayField || 'name';

            fields.push({
                name: cfg.name,
                type: 'MULTISELECT',
                allowNull: true,
                isMultiSelect: true,
                reference: {
                    model: cfg.reference_model,
                    modelName: cfg.reference_model.replace(/\.model$/i, '').split(/[-_]/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(''),
                    displayField,
                },
            });
        });
    }

    // Build where clause and paranoid based on visibility (active | inactive | all)
    const offset = (page - 1) * limit;
    const visibilityVal = visibility && VALID_VISIBILITY.includes(visibility) ? visibility : VISIBILITY_ACTIVE;
    const where = {};

    if (visibilityVal === VISIBILITY_ACTIVE) {
        where.deleted_at = null;
    } else if (visibilityVal === VISIBILITY_INACTIVE) {
        where.deleted_at = { [Op.ne]: null };
    }
    // for VISIBILITY_ALL we do not add deleted_at to where

    if (status) {
        where.status = status;
    }

    if (q) {
        // Try to find searchable fields (name, title, etc.)
        const searchableFields = fields
            .filter(f => ['STRING', 'TEXT'].includes(f.type) && !f.primaryKey)
            .map(f => f.name);

        if (searchableFields.length > 0) {
            where[Op.or] = searchableFields.map(field => ({
                [field]: { [Op.iLike]: `%${q}%` }
            }));
        }
    }

    // Apply column filters from request (field name, field_op, field_to)
    const skipFilterFields = ['id', 'password', 'page', 'limit', 'q', 'status', 'visibility', 'sortBy', 'sortOrder'];
    if (filters && typeof filters === 'object') {
        fields.forEach((field) => {
            if (skipFilterFields.includes(field.name) || field.isFileUpload || field.primaryKey) return;
            const value = filters[field.name];
            const valueTo = filters[field.name + '_to'];
            const op = filters[field.name + '_op'] || '';

            const type = (field.type || 'STRING').toUpperCase();
            if (field.reference && !field.isMultiSelect) {
                // BelongsTo: filter by FK id (exact match); only apply when value is numeric
                if (value !== '' && value != null && value !== undefined) {
                    const idNum = Number(value);
                    if (!Number.isNaN(idNum)) {
                        where[field.name] = idNum;
                    }
                }
                return;
            }
            if (type === 'BOOLEAN') {
                if (value === 'true' || value === true) {
                    where[field.name] = true;
                } else if (value === 'false' || value === false) {
                    where[field.name] = false;
                }
                return;
            }
            if (['INTEGER', 'BIGINT', 'DECIMAL', 'FLOAT', 'DOUBLE', 'NUMERIC'].includes(type)) {
                const cond = buildNumberCond(field.name, value, op, valueTo);
                if (cond) {
                    where[Op.and] = where[Op.and] || [];
                    where[Op.and].push(cond);
                }
                return;
            }
            if (['DATE', 'DATEONLY', 'TIMESTAMP'].includes(type)) {
                const cond = buildDateCond(field.name, value, op, valueTo);
                if (cond) {
                    where[Op.and] = where[Op.and] || [];
                    where[Op.and].push(cond);
                }
                return;
            }
            // STRING, TEXT, and reference display (treated as text)
            const cond = buildStringCond(field.name, value, op || 'contains');
            if (cond) {
                where[Op.and] = where[Op.and] || [];
                where[Op.and].push(cond);
            }
        });
    }

    // Build includes for reference fields (foreign keys)
    const includes = [];
    fields.forEach((field) => {
        if (field.reference && !field.isMultiSelect) {
            const RefModel = getModelByName(field.reference.model);
            if (RefModel) {
                // Get display field configuration
                const displayConfig = modelDisplayFields[field.reference.model] || {};
                const displayField = displayConfig.displayField || 'name';

                // Check if display field exists in the reference model
                const refAttributes = RefModel.rawAttributes || {};
                const attributes = ['id'];
                if (refAttributes[displayField]) {
                    attributes.push(displayField);
                } else if (refAttributes.name) {
                    attributes.push('name');
                } else if (refAttributes.code) {
                    attributes.push('code');
                }

                // Determine the association alias
                // Check if there's a defined association in the model
                let associationAlias = field.reference.modelName.toLowerCase(); // default: 'state' for State model

                // Try to find the correct alias from model associations
                // For City -> State, the alias should be 'state' (from associations.js)
                // We'll use the modelName lowercase as default, but this can be overridden
                if (Model.associations) {
                    // Check if there's an association with this model
                    const association = Object.values(Model.associations).find(
                        assoc => assoc.target === RefModel && assoc.associationType === 'BelongsTo'
                    );
                    if (association && association.as) {
                        associationAlias = association.as;
                    }
                }

                includes.push({
                    model: RefModel,
                    as: associationAlias,
                    attributes: attributes,
                    required: false, // LEFT JOIN so records without relations still appear
                    paranoid: false, // Include soft-deleted related records so we can display their names
                });
            }
        }

        // Handle multiselect references (BelongsToMany)
        if (field.reference && field.isMultiSelect) {
            const RefModel = getModelByName(field.reference.model);
            if (RefModel && Model.associations) {
                const displayConfig = modelDisplayFields[field.reference.model] || {};
                const displayField = displayConfig.displayField || 'name';

                // Determine association alias for BelongsToMany
                const association = Object.values(Model.associations).find(
                    assoc => assoc.target === RefModel && assoc.associationType === 'BelongsToMany'
                );
                if (association && association.as) {
                    const refAttributes = RefModel.rawAttributes || {};
                    const attributes = ['id'];
                    if (refAttributes[displayField]) {
                        attributes.push(displayField);
                    } else if (refAttributes.name) {
                        attributes.push('name');
                    } else if (refAttributes.code) {
                        attributes.push('code');
                    } else if (refAttributes.title) {
                        attributes.push('title');
                    } else if (refAttributes.label) {
                        attributes.push('label');
                    }

                    includes.push({
                        model: RefModel,
                        as: association.as,
                        attributes,
                        through: { attributes: [] }, // don't need join table columns
                        required: false,
                        paranoid: false,
                    });
                }
            }
        }
    });

    // Fetch data with includes
    const findOptions = {
        where,
        offset,
        limit,
        order: [['id', 'DESC']],
    };
    if (visibilityVal === VISIBILITY_INACTIVE || visibilityVal === VISIBILITY_ALL) {
        findOptions.paranoid = false;
    }

    if (includes.length > 0) {
        findOptions.include = includes;
    }

    const countOptions = { where };
    if (visibilityVal === VISIBILITY_INACTIVE || visibilityVal === VISIBILITY_ALL) {
        countOptions.paranoid = false;
    }

    const rows = await Model.findAll(findOptions);
    const count = await Model.count(countOptions);

    // Convert to plain objects and add display values for reference fields
    const data = rows.map((row) => {
        const rowData = row.toJSON();

        // For each reference field, add a display value
        fields.forEach((field) => {
            if (field.reference && !field.isMultiSelect) {
                // Try to find the association alias
                let refKey = field.reference.modelName.toLowerCase(); // default: 'state'

                // Check if there's a defined association
                if (Model.associations) {
                    const RefModel = getModelByName(field.reference.model);
                    const association = Object.values(Model.associations).find(
                        assoc => assoc.target === RefModel && assoc.associationType === 'BelongsTo'
                    );
                    if (association && association.as) {
                        refKey = association.as;
                    }
                }

                const refData = rowData[refKey];

                if (refData) {
                    const displayConfig = modelDisplayFields[field.reference.model] || {};
                    const displayField = displayConfig.displayField || 'name';
                    // Add display value: e.g., state_id_display = "Gujarat"
                    rowData[`${field.name}_display`] = refData[displayField] || refData.name || refData.code || `ID: ${refData.id}`;
                } else {
                    rowData[`${field.name}_display`] = null;
                }
            }

            // Build display for multiselect (BelongsToMany) fields
            if (field.reference && field.isMultiSelect) {
                let refKey = null;
                const RefModel = getModelByName(field.reference.model);
                if (Model.associations && RefModel) {
                    const association = Object.values(Model.associations).find(
                        assoc => assoc.target === RefModel && assoc.associationType === 'BelongsToMany'
                    );
                    if (association && association.as) {
                        refKey = association.as;
                    }
                }

                const list = refKey ? rowData[refKey] : null;
                if (Array.isArray(list) && list.length > 0) {
                    const displayConfig = modelDisplayFields[field.reference.model] || {};
                    const displayField = displayConfig.displayField || 'name';
                    const labels = list.map(item => item[displayField] || item.name || item.code || item.title || item.label || `ID: ${item.id}`);
                    rowData[`${field.name}_display`] = labels.join(', ');
                } else {
                    rowData[`${field.name}_display`] = '';
                }
            }
        });

        return rowData;
    });

    return {
        fields, // Field definitions with types
        data,   // List of records
        meta: {
            page,
            limit,
            total: count,
            pages: limit > 0 ? Math.ceil(count / limit) : 0,
        },
    };
};

/**
 * Generic function to delete a master record for any model
 * @param {Object} params - { model, id }
 * @returns {boolean}
 */
const deleteMaster = async ({ model, id } = {}) => {
    if (!model || !id) {
        throw new AppError('Model name and id are required', RESPONSE_STATUS_CODES.BAD_REQUEST);
    }

    const Model = getModelByName(model);
    const record = await Model.findOne({ where: { id, deleted_at: null } });
    if (!record) {
        throw new AppError('Record not found', RESPONSE_STATUS_CODES.NOT_FOUND);
    }

    // Soft delete using destroy() method (handles paranoid models correctly)
    await record.destroy();

    // If model has status field, update it separately
    if (Model.rawAttributes.status) {
        await Model.update(
            { status: 'deleted' },
            { where: { id }, paranoid: false }
        );
    }

    return true;
};

/**
 * Generic function to create a master record for any model
 * @param {Object} params - { model, payload, userId } - userId kept for backwards compatibility; audit fields auto-set from request context
 * @returns {Object} - Created record
 */
const createMaster = async ({ model, payload, userId } = {}) => {
    if (!model || !payload) {
        throw new AppError('Model name and payload are required', RESPONSE_STATUS_CODES.BAD_REQUEST);
    }

    const Model = getModelByName(model);
    const modelAttributes = Model.rawAttributes || {};

    // Load multiselect config for this model
    const mastersConfig = require('../../common/utils/masters.json');
    const masterConfig = mastersConfig.find(m => m.model_name === model) || {};
    const multiSelectConfigs = masterConfig.multiselect_fields || [];

    // Extract and strip multiselect values from payload to avoid unknown column issues
    const multiValues = {};
    if (Array.isArray(multiSelectConfigs)) {
        for (const cfg of multiSelectConfigs) {
            if (cfg && cfg.name && payload.hasOwnProperty(cfg.name)) {
                const raw = payload[cfg.name];
                multiValues[cfg.name] = Array.isArray(raw) ? raw.map(Number).filter(v => !Number.isNaN(v)) : [];
                delete payload[cfg.name];
            }
        }
    }

    // Check for unique fields (code, email, etc.)
    const uniqueFields = Object.keys(modelAttributes).filter(
        key => modelAttributes[key].unique && payload[key]
    );

    for (const fieldName of uniqueFields) {
        const existing = await Model.findOne({
            where: { [fieldName]: payload[fieldName], deleted_at: null }
        });
        if (existing) {
            throw new AppError(
                `${fieldName.charAt(0).toUpperCase() + fieldName.slice(1)} already exists`,
                RESPONSE_STATUS_CODES.BAD_REQUEST
            );
        }
    }

    // Special handling for State model - default state logic
    if (model === 'state.model' || Model.tableName === 'states') {
        // Check if this is the first state
        const existingStates = await Model.count({
            where: { deleted_at: null }
        });

        // Determine is_default value
        // If it's the first state, automatically set as default
        // Otherwise, use the payload value (default to false if not provided)
        const isDefault = existingStates === 0 ? true : (payload.is_default !== undefined ? payload.is_default : false);

        // If setting as default, unset other default states
        if (isDefault === true) {
            await Model.update(
                { is_default: false },
                {
                    where: { deleted_at: null }
                }
            );
        }

        // Set is_default in payload
        payload.is_default = isDefault;
    }

    // Create the record
    const created = await Model.create(payload);

    // Helper to capitalize alias for mixin method names
    const toSetMethod = (alias) => `set${alias.charAt(0).toUpperCase()}${alias.slice(1)}`;

    // Attach multiselect relations (BelongsToMany)
    if (Array.isArray(multiSelectConfigs) && multiSelectConfigs.length > 0 && Model.associations) {
        for (const cfg of multiSelectConfigs) {
            if (!cfg || !cfg.name || !cfg.reference_model) continue;
            const RefModel = getModelByName(cfg.reference_model);
            if (!RefModel) continue;

            const association = Object.values(Model.associations).find(
                assoc => assoc.target === RefModel && assoc.associationType === 'BelongsToMany'
            );
            if (!association || !association.as) continue;

            const ids = multiValues[cfg.name] || [];
            const method = toSetMethod(association.as);
            if (typeof created[method] === 'function') {
                await created[method](ids);
            }
        }
    }

    return created.toJSON();
};

/**
 * Generic function to get a master record by ID for any model
 * @param {Object} params - { model, id }
 * @returns {Object} - Record
 */
const getMasterById = async ({ model, id } = {}) => {
    if (!model || !id) {
        throw new AppError('Model name and id are required', RESPONSE_STATUS_CODES.BAD_REQUEST);
    }

    const Model = getModelByName(model);

    // Load multiselect config for this model (to include associations)
    const mastersConfig = require('../../common/utils/masters.json');
    const masterConfig = mastersConfig.find(m => m.model_name === model) || {};
    const multiSelectConfigs = masterConfig.multiselect_fields || [];

    // Build includes for BelongsToMany to fetch selected ids for edit/view
    const include = [];
    if (Array.isArray(multiSelectConfigs) && multiSelectConfigs.length > 0 && Model.associations) {
        for (const cfg of multiSelectConfigs) {
            if (!cfg || !cfg.reference_model) continue;
            const RefModel = getModelByName(cfg.reference_model);
            if (!RefModel) continue;
            const association = Object.values(Model.associations).find(
                assoc => assoc.target === RefModel && assoc.associationType === 'BelongsToMany'
            );
            if (association && association.as) {
                include.push({
                    model: RefModel,
                    as: association.as,
                    attributes: ['id'],
                    through: { attributes: [] },
                    required: false,
                    paranoid: false,
                });
            }
        }
    }

    // Find the record
    const record = await Model.findOne({ where: { id, deleted_at: null }, include: include.length ? include : undefined });
    if (!record) {
        throw new AppError('Record not found', RESPONSE_STATUS_CODES.NOT_FOUND);
    }

    const json = record.toJSON();

    // For multiselect fields, populate the field with array of IDs for default values
    if (Array.isArray(multiSelectConfigs) && multiSelectConfigs.length > 0 && Model.associations) {
        for (const cfg of multiSelectConfigs) {
            if (!cfg || !cfg.name || !cfg.reference_model) continue;
            const RefModel = getModelByName(cfg.reference_model);
            if (!RefModel) continue;
            const association = Object.values(Model.associations).find(
                assoc => assoc.target === RefModel && assoc.associationType === 'BelongsToMany'
            );
            if (association && association.as && Array.isArray(json[association.as])) {
                json[cfg.name] = json[association.as].map(item => item.id);
            }
        }
    }

    return json;
};

/**
 * Generic function to update a master record for any model
 * @param {Object} params - { model, id, updates, userId }
 * @returns {Object} - Updated record
 */
const updateMaster = async ({ model, id, updates, userId } = {}) => {
    if (!model || !id || !updates) {
        throw new AppError('Model name, id, and updates are required', RESPONSE_STATUS_CODES.BAD_REQUEST);
    }

    const Model = getModelByName(model);
    const modelAttributes = Model.rawAttributes || {};
    delete updates.created_by; // never allow updating created_by

    // Load multiselect config for this model
    const mastersConfig = require('../../common/utils/masters.json');
    const masterConfig = mastersConfig.find(m => m.model_name === model) || {};
    const multiSelectConfigs = masterConfig.multiselect_fields || [];

    // Extract multiselect values and strip from updates
    const multiValues = {};
    if (Array.isArray(multiSelectConfigs)) {
        for (const cfg of multiSelectConfigs) {
            if (cfg && cfg.name && updates.hasOwnProperty(cfg.name)) {
                const raw = updates[cfg.name];
                multiValues[cfg.name] = Array.isArray(raw) ? raw.map(Number).filter(v => !Number.isNaN(v)) : [];
                delete updates[cfg.name];
            }
        }
    }

    // Find the record
    const record = await Model.findOne({ where: { id, deleted_at: null } });
    if (!record) {
        throw new AppError('Record not found', RESPONSE_STATUS_CODES.NOT_FOUND);
    }

    // Check for unique fields if they're being updated
    const uniqueFields = Object.keys(modelAttributes).filter(
        key => modelAttributes[key].unique && updates[key] && updates[key] !== record[key]
    );

    for (const fieldName of uniqueFields) {
        const existing = await Model.findOne({
            where: { [fieldName]: updates[fieldName], deleted_at: null, id: { [Op.ne]: id } }
        });
        if (existing) {
            throw new AppError(
                `${fieldName.charAt(0).toUpperCase() + fieldName.slice(1)} already exists`,
                RESPONSE_STATUS_CODES.BAD_REQUEST
            );
        }
    }

    // Remove internal fields from updates
    const safeUpdates = { ...updates };
    delete safeUpdates.id;
    delete safeUpdates.created_at;
    delete safeUpdates.updated_at;
    delete safeUpdates.deleted_at;

    // Special handling for State model - default state logic
    if (model === 'state.model' || Model.tableName === 'states') {
        const isDefault = safeUpdates.is_default !== undefined ? safeUpdates.is_default : record.is_default;

        // Check if this is the only state
        const stateCount = await Model.count({
            where: { deleted_at: null }
        });

        // Validation: Cannot unset default if it's the only state
        if (isDefault === false && stateCount === 1 && record.is_default === true) {
            throw new AppError(
                'Cannot unset default state. At least one state must be set as default.',
                RESPONSE_STATUS_CODES.BAD_REQUEST
            );
        }

        // If setting as default, unset other default states (excluding current one)
        if (isDefault === true && record.is_default !== true) {
            await Model.update(
                { is_default: false },
                {
                    where: {
                        id: { [Op.ne]: id },
                        deleted_at: null
                    }
                }
            );
        }

        // Ensure is_default is in safeUpdates
        safeUpdates.is_default = isDefault;
    }

    // Update the record
    await record.update({ ...safeUpdates });

    // Helper to capitalize alias for mixin method names
    const toSetMethod = (alias) => `set${alias.charAt(0).toUpperCase()}${alias.slice(1)}`;

    // Update multiselect relations (BelongsToMany)
    if (Array.isArray(multiSelectConfigs) && multiSelectConfigs.length > 0 && Model.associations) {
        for (const cfg of multiSelectConfigs) {
            if (!cfg || !cfg.name || !cfg.reference_model) continue;
            const RefModel = getModelByName(cfg.reference_model);
            if (!RefModel) continue;

            const association = Object.values(Model.associations).find(
                assoc => assoc.target === RefModel && assoc.associationType === 'BelongsToMany'
            );
            if (!association || !association.as) continue;

            if (multiValues.hasOwnProperty(cfg.name)) {
                const ids = multiValues[cfg.name] || [];
                const method = toSetMethod(association.as);
                if (typeof record[method] === 'function') {
                    await record[method](ids);
                }
            }
        }
    }

    return record.toJSON();
};

/**
 * Generic function to get reference options for a model (for select dropdowns)
 * @param {Object} params - { model, status } - status is optional filter when model has status attribute
 * @returns {Array} - Array of { id, label, value, ... } objects
 */
const getReferenceOptions = async ({ model, status } = {}) => {
    if (!model) {
        throw new AppError('Model name is required', RESPONSE_STATUS_CODES.BAD_REQUEST);
    }

    const Model = getModelByName(model);

    // Get display field configuration from config file or model static property
    const modelNameForConfig = model.replace(/\.model$/i, '');
    const displayConfig = modelDisplayFields[model] || modelDisplayFields[`${modelNameForConfig}.model`] || {};
    const displayField = Model.displayField || displayConfig.displayField || 'name';
    const orderByField = displayConfig.orderBy || displayField;

    // Check if display field exists in model
    const modelAttributes = Model.rawAttributes || {};
    const hasDisplayField = modelAttributes[displayField];
    const hasOrderByField = modelAttributes[orderByField];

    // Build where clause
    const where = { deleted_at: null };
    if (status && modelAttributes.status) {
        where.status = status;
    }

    // Build order clause
    let orderBy = [['id', 'ASC']];
    
    // Special handling for State model - order by is_default first
    if (model === 'state.model' || Model.tableName === 'states') {
        if (modelAttributes.is_default) {
            orderBy = [['is_default', 'DESC']];
            if (hasOrderByField) {
                orderBy.push([orderByField, 'ASC']);
            } else if (modelAttributes.name) {
                orderBy.push(['name', 'ASC']);
            }
        }
    } else if (hasOrderByField) {
        orderBy = [[orderByField, 'ASC']];
    } else if (modelAttributes.name) {
        orderBy = [['name', 'ASC']];
    } else if (modelAttributes.code) {
        orderBy = [['code', 'ASC']];
    }

    // Build attributes array - always include id, display field, and foreign key fields (fields ending with _id)
    const attributes = ['id'];
    if (hasDisplayField) {
        attributes.push(displayField);
    } else {
        // Fallback to common fields if display field doesn't exist
        if (modelAttributes.name) attributes.push('name');
        if (modelAttributes.code) attributes.push('code');
        if (modelAttributes.title) attributes.push('title');
        if (modelAttributes.label) attributes.push('label');
    }

    // Include foreign key fields (fields ending with _id) so frontend can filter by them
    Object.keys(modelAttributes).forEach((attrName) => {
        if (attrName.endsWith('_id') && !attributes.includes(attrName)) {
            attributes.push(attrName);
        }
    });

    // Include is_default for State model
    if ((model === 'state.model' || Model.tableName === 'states') && modelAttributes.is_default && !attributes.includes('is_default')) {
        attributes.push('is_default');
    }

    // For PurchaseOrder, include Supplier so we can show "po_number - supplier_name" in dropdown
    const isPurchaseOrder = model === 'purchaseOrder.model' || model === 'purchase_order.model' || Model.tableName === 'purchase_orders';
    const findOptions = {
        where,
        order: orderBy,
        attributes: attributes,
    };
    if (isPurchaseOrder && db.Supplier) {
        findOptions.include = [
            { model: db.Supplier, as: 'supplier', attributes: ['id', 'supplier_name'], required: false },
        ];
    }

    const rows = await Model.findAll(findOptions);

    // Convert to options format - return all fields from the model, not just label
    const options = rows.map((row) => {
        const data = row.toJSON();
        let label = data[displayField] || data.name || data.code || data.title || data.label || `ID: ${data.id}`;
        if (isPurchaseOrder && data.supplier && data.supplier.supplier_name) {
            label = `${data.po_number || data.id} - ${data.supplier.supplier_name}`;
        }
        // Return all the data fields, so frontend can use the actual field names (name, unit, etc.)
        return {
            id: data.id,
            ...data, // Include all fields from the model (name, unit, product_type_id, etc.)
            label,
            value: data.id,
        };
    });

    return options;
};

/**
 * Get the default state
 * @returns {Object|null} - Default state or null if none exists
 */
const getDefaultState = async () => {
    const State = getModelByName('state.model');
    
    const defaultState = await State.findOne({
        where: { deleted_at: null, is_default: true },
    });

    return defaultState ? defaultState.toJSON() : null;
};

module.exports = {
    getMasterList,
    deleteMaster,
    createMaster,
    getMasterById,
    updateMaster,
    getReferenceOptions,
    getDefaultState,
};

/**
 * Helper function to format field name to display label (matches frontend logic)
 * e.g., "state_id" -> "State", "product_name" -> "Product Name"
 */
function formatFieldLabel(fieldName, isReference = false) {
    let label = fieldName;
    // Remove _id suffix for reference fields
    if (isReference && label.endsWith('_id')) {
        label = label.replace(/_id$/, '');
    }
    // Convert snake_case to Title Case
    return label
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
}

/**
 * Generate sample CSV (header only) for a given master model
 * Uses display labels matching the listing (e.g., "State" instead of "state_id")
 * Skips file upload fields and internal fields
 */
const generateSampleCsv = async ({ model } = {}) => {
    if (!model) {
        throw new AppError('Model name is required', RESPONSE_STATUS_CODES.BAD_REQUEST);
    }
    const Model = getModelByName(model);
    const mastersConfig = require('../../common/utils/masters.json');
    const masterConfig = mastersConfig.find(m => m.model_name === model) || {};
    const fileUploadFields = masterConfig.file_upload_fields || [];
    const multiSelectConfigs = masterConfig.multiselect_fields || [];
    const multiSelectFieldNames = new Set((multiSelectConfigs || []).map(c => c?.name).filter(Boolean));

    // Build field definitions similar to getMasterList
    const fields = [];
    const modelAttributes = Model.rawAttributes || {};
    
    Object.keys(modelAttributes).forEach((fieldName) => {
        const attribute = modelAttributes[fieldName];
        // Skip internal fields
        if (['id', 'created_at', 'updated_at', 'deleted_at', 'created_by', 'updated_by'].includes(fieldName)) {
            return;
        }
        if (attribute.autoIncrement || attribute.primaryKey) {
            return;
        }
        if (fileUploadFields.includes(fieldName)) {
            return; // Skip file upload fields
        }
        if (multiSelectFieldNames.has(fieldName)) {
            return; // Skip multiselect fields
        }

        const fieldDef = {
            name: fieldName,
            type: attribute.type?.key || attribute.type?.toString() || 'STRING',
            isReference: false,
        };

        // Check if this is a foreign key field (ends with _id or has references)
        if (fieldName.endsWith('_id') || attribute.references) {
            const refModel = attribute.references?.model;
            if (refModel) {
                // Extract model name from table name
                const refModelName = refModel
                    .split('_')
                    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                    .join('');

                // Find the model file name
                const modelFiles = require('fs').readdirSync(require('path').join(__dirname, '../../models'))
                    .filter(f => f.endsWith('.model.js'));

                const refModelFile = modelFiles.find(f => {
                    const model = require(require('path').join(__dirname, '../../models', f));
                    return model.tableName === refModel || model.name === refModelName;
                });

                if (refModelFile) {
                    const modelNameForApi = refModelFile.replace(/\.js$/, '');
                    const displayConfig = modelDisplayFields[modelNameForApi] || {};
                    const displayField = displayConfig.displayField || 'name';

                    fieldDef.isReference = true;
                    fieldDef.reference = {
                        model: modelNameForApi,
                        modelName: refModelName,
                        tableName: refModel,
                        displayField: displayField,
                    };
                }
            }
        }

        fields.push(fieldDef);
    });

    // Generate headers with display labels
    const headers = fields.map(field => {
        return formatFieldLabel(field.name, field.isReference);
    });

    // Create mapping for upload: displayLabel -> actualFieldName
    const headerToFieldMap = {};
    fields.forEach(field => {
        const displayLabel = formatFieldLabel(field.name, field.isReference);
        headerToFieldMap[displayLabel] = {
            fieldName: field.name,
            isReference: field.isReference,
            reference: field.reference || null,
        };
    });

    const filename = `${model.replace(/\.model$/i, '')}-sample.csv`;
    const csv = headers.join(',') + '\n';
    return { filename, csv, headers, headerToFieldMap };
};

/**
 * Simple CSV parser for header + rows (no complex quoting support)
 */
function parseCsvBasic(csvText) {
    const lines = csvText.split(/\r?\n/).filter(l => l.trim().length > 0);
    if (lines.length === 0) return { headers: [], rows: [] };
    const headers = lines[0].split(',').map(h => h.trim());
    const rows = lines.slice(1).map(line => {
        const cols = line.split(',').map(c => c.trim());
        const obj = {};
        headers.forEach((h, i) => {
            obj[h] = cols[i] ?? '';
        });
        return obj;
    });
    return { headers, rows };
}

/**
 * Resolve reference field value (name) to ID
 * @param {Object} reference - Reference config { model, displayField }
 * @param {string} displayValue - The display value (e.g., state name)
 * @returns {Promise<{id: number|null, error: string|null}>} - The ID and any error
 */
async function resolveReferenceValue(reference, displayValue) {
    if (!reference || !displayValue || displayValue.trim() === '') {
        return { id: null, error: null };
    }

    try {
        const RefModel = getModelByName(reference.model);
        const displayField = reference.displayField || 'name';
        const searchValue = displayValue.trim();
        
        // Check if display field exists in the reference model
        const refAttributes = RefModel.rawAttributes || {};
        
        // Use Op.iLike for case-insensitive search (PostgreSQL)
        let record = null;
        if (refAttributes[displayField]) {
            // Search by display field (case-insensitive)
            record = await RefModel.findOne({
                where: {
                    [displayField]: { [Op.iLike]: searchValue },
                    deleted_at: null
                },
                attributes: ['id'],
                paranoid: false,
            });
        }

        if (!record) {
            // Fallback to common fields
            const fallbackFields = ['name', 'code', 'title', 'label'];
            for (const field of fallbackFields) {
                if (refAttributes[field]) {
                    record = await RefModel.findOne({
                        where: { 
                            [field]: { [Op.iLike]: searchValue },
                            deleted_at: null 
                        },
                        attributes: ['id'],
                        paranoid: false,
                    });
                    if (record) break;
                }
            }
        }

        if (!record) {
            return { 
                id: null, 
                error: `"${searchValue}" not found in ${reference.modelName}` 
            };
        }

        return { id: record.id, error: null };
    } catch (err) {
        console.error('Error resolving reference value:', err);
        return { 
            id: null, 
            error: `Error resolving reference: ${err.message}` 
        };
    }
}

/**
 * Bulk upload from CSV text. Inserts records similar to createMaster.
 * Maps display headers back to field names and resolves reference fields by name.
 * Validates CSV headers match expected fields for the model.
 */
const bulkUploadFromCsv = async ({ model, csvText, filename } = {}) => {
    if (!model || !csvText) {
        throw new AppError('Model and csvText are required', RESPONSE_STATUS_CODES.BAD_REQUEST);
    }
    const Model = getModelByName(model);
    const mastersConfig = require('../../common/utils/masters.json');
    const masterConfig = mastersConfig.find(m => m.model_name === model) || {};
    const fileUploadFields = masterConfig.file_upload_fields || [];
    const multiSelectConfigs = masterConfig.multiselect_fields || [];
    const multiSelectFieldNames = new Set((multiSelectConfigs || []).map(c => c?.name).filter(Boolean));
    const modelAttributes = Model.rawAttributes || {};

    const { headers, rows } = parseCsvBasic(csvText);
    if (!headers.length) {
        throw new AppError('CSV has no headers', RESPONSE_STATUS_CODES.BAD_REQUEST);
    }

    // Build expected headers for this model (same as generateSampleCsv)
    const expectedFields = [];
    Object.keys(modelAttributes).forEach((fieldName) => {
        const attribute = modelAttributes[fieldName];
        if (['id', 'created_at', 'updated_at', 'deleted_at', 'created_by', 'updated_by'].includes(fieldName)) return;
        if (attribute.autoIncrement || attribute.primaryKey) return;
        if (fileUploadFields.includes(fieldName)) return;
        if (multiSelectFieldNames.has(fieldName)) return;

        let isReference = false;
        if (fieldName.endsWith('_id') || attribute.references) {
            const refModel = attribute.references?.model;
            if (refModel) {
                const refModelName = refModel
                    .split('_')
                    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                    .join('');

                const modelFiles = require('fs').readdirSync(require('path').join(__dirname, '../../models'))
                    .filter(f => f.endsWith('.model.js'));

                const refModelFile = modelFiles.find(f => {
                    const model = require(require('path').join(__dirname, '../../models', f));
                    return model.tableName === refModel || model.name === refModelName;
                });

                if (refModelFile) {
                    isReference = true;
                }
            }
        }

        const displayLabel = formatFieldLabel(fieldName, isReference);
        expectedFields.push(displayLabel);
    });

    // Validate CSV headers match expected fields
    // Allow CSV to have all expected fields (order doesn't matter), but check for significant mismatches
    const csvHeadersLower = headers.map(h => h.trim().toLowerCase());
    const expectedFieldsLower = expectedFields.map(f => f.toLowerCase());
    
    // Count how many expected fields are present in CSV
    const matchingFields = expectedFieldsLower.filter(expected => 
        csvHeadersLower.includes(expected)
    );
    
    // If less than 50% of expected fields match, it's likely a wrong file
    const matchRatio = expectedFields.length > 0 ? matchingFields.length / expectedFields.length : 0;
    
    if (matchRatio < 0.5) {
        const expectedFieldsStr = expectedFields.join(', ');
        const receivedFieldsStr = headers.join(', ');
        throw new AppError(
            `CSV file mismatch: The uploaded CSV headers do not match the expected fields for ${model.replace(/\.model$/i, '')}. ` +
            `Expected fields (some or all): ${expectedFieldsStr}. ` +
            `Received fields: ${receivedFieldsStr}. ` +
            `Please ensure you are uploading the correct CSV file for this master.`,
            RESPONSE_STATUS_CODES.BAD_REQUEST
        );
    }
    
    // Also check for unexpected fields that might indicate wrong model
    const unexpectedFields = csvHeadersLower.filter(csvHeader => 
        !expectedFieldsLower.includes(csvHeader) && 
        csvHeader.length > 0 // ignore empty headers
    );
    
    // If there are many unexpected fields and few matching fields, it's likely wrong
    if (unexpectedFields.length > matchingFields.length && matchingFields.length < expectedFields.length * 0.7) {
        throw new AppError(
            `CSV file mismatch: The uploaded CSV contains many fields that don't belong to ${model.replace(/\.model$/i, '')}. ` +
            `Please ensure you are uploading the correct CSV file for this master.`,
            RESPONSE_STATUS_CODES.BAD_REQUEST
        );
    }

    // Build header-to-field mapping (same logic as generateSampleCsv)
    const headerToFieldMap = {};
    Object.keys(modelAttributes).forEach((fieldName) => {
        const attribute = modelAttributes[fieldName];
        if (['id', 'created_at', 'updated_at', 'deleted_at', 'created_by', 'updated_by'].includes(fieldName)) return;
        if (attribute.autoIncrement || attribute.primaryKey) return;
        if (fileUploadFields.includes(fieldName)) return;
        if (multiSelectFieldNames.has(fieldName)) return;

        let isReference = false;
        let reference = null;

        if (fieldName.endsWith('_id') || attribute.references) {
            const refModel = attribute.references?.model;
            if (refModel) {
                const refModelName = refModel
                    .split('_')
                    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                    .join('');

                const modelFiles = require('fs').readdirSync(require('path').join(__dirname, '../../models'))
                    .filter(f => f.endsWith('.model.js'));

                const refModelFile = modelFiles.find(f => {
                    const model = require(require('path').join(__dirname, '../../models', f));
                    return model.tableName === refModel || model.name === refModelName;
                });

                if (refModelFile) {
                    const modelNameForApi = refModelFile.replace(/\.js$/, '');
                    const displayConfig = modelDisplayFields[modelNameForApi] || {};
                    const displayField = displayConfig.displayField || 'name';

                    isReference = true;
                    reference = {
                        model: modelNameForApi,
                        modelName: refModelName,
                        tableName: refModel,
                        displayField: displayField,
                    };
                }
            }
        }

        const displayLabel = formatFieldLabel(fieldName, isReference);
        headerToFieldMap[displayLabel] = {
            fieldName: fieldName,
            isReference: isReference,
            reference: reference,
            attribute: attribute,
        };
    });

    const results = [];
    let inserted = 0;
    let failed = 0;
    const processedRows = []; // Store original row data with results

    for (let idx = 0; idx < rows.length; idx++) {
        const rawRow = rows[idx];
        const payload = {};
        let rowError = null;
        const originalRowData = { ...rawRow }; // Keep original row data

        // Map CSV columns (using display headers) to actual field names
        for (const displayHeader of headers) {
            const fieldMapping = headerToFieldMap[displayHeader];
            if (!fieldMapping) {
                // Skip unknown headers
                continue;
            }

            const { fieldName, isReference, reference, attribute } = fieldMapping;
            let val = rawRow[displayHeader];

            // Resolve reference fields by name
            if (isReference && reference && val && val.trim() !== '') {
                const { id: resolvedId, error: refError } = await resolveReferenceValue(reference, val);
                if (refError) {
                    rowError = `${displayHeader}: ${refError}`;
                    break; // Stop processing this row
                }
                val = resolvedId;
            }

            // Convert data types
            const typeKey = attribute.type?.key || '';
            const isNumeric = ['INTEGER', 'BIGINT', 'FLOAT', 'DOUBLE', 'DECIMAL'].includes(typeKey) || fieldName.endsWith('_id');
            const isBoolean = typeKey === 'BOOLEAN';

            if (isNumeric) {
                if (val === '' || val === undefined || val === null) {
                    val = null;
                } else if (isReference && typeof val === 'number') {
                    // Already resolved to ID
                    val = val;
                } else {
                    const n = Number(val);
                    val = Number.isNaN(n) ? null : n;
                }
            } else if (isBoolean) {
                const s = String(val).toLowerCase();
                val = s === 'true' || s === '1' || s === 'yes';
            } else {
                if (val === undefined || val === null) val = '';
                val = String(val).trim();
            }

            payload[fieldName] = val;
        }

        // Handle row errors or empty payload
        if (rowError) {
            failed += 1;
            const resultEntry = {
                row: idx + 2, // +2 because row 1 is header, data starts at row 2
                status: 'failed',
                error: rowError,
                message: `Error: ${rowError}`,
            };
            results.push(resultEntry);
            processedRows.push({
                originalData: originalRowData,
                result: resultEntry,
            });
            continue;
        }

        if (Object.keys(payload).length === 0) {
            failed += 1;
            const resultEntry = {
                row: idx + 2,
                status: 'failed',
                error: 'No valid fields found',
                message: 'Error: No valid fields found',
            };
            results.push(resultEntry);
            processedRows.push({
                originalData: originalRowData,
                result: resultEntry,
            });
            continue;
        }

        try {
            const created = await createMaster({ model, payload });
            const resultEntry = {
                row: idx + 2,
                status: 'inserted',
                id: created?.id || null,
                message: `Success: Record inserted with ID ${created?.id || 'N/A'}`,
            };
            results.push(resultEntry);
            inserted += 1;
            processedRows.push({
                originalData: originalRowData,
                result: resultEntry,
            });
        } catch (err) {
            failed += 1;
            const resultEntry = {
                row: idx + 2,
                status: 'failed',
                error: err?.message || 'Insert error',
                message: `Error: ${err?.message || 'Insert error'}`,
            };
            results.push(resultEntry);
            processedRows.push({
                originalData: originalRowData,
                result: resultEntry,
            });
        }
    }

    // Ensure counts are accurate - every row should be either inserted or failed
    const totalProcessed = processedRows.length;
    
    // Verify counts match - every processed row should be either inserted or failed
    // If there's a mismatch, recalculate failed based on processed rows
    if (inserted + failed !== totalProcessed) {
        console.warn(`Count mismatch detected: inserted=${inserted}, failed=${failed}, processedRows=${totalProcessed}. Recalculating...`);
        // Recalculate failed count from processedRows
        failed = 0;
        inserted = 0;
        processedRows.forEach(({ result }) => {
            if (result.status === 'inserted') {
                inserted++;
            } else {
                failed++;
            }
        });
    }

    // Generate result CSV with original columns + status message column
    let resultCsv = '';
    if (headers.length > 0 && processedRows.length > 0) {
        // Add headers: original headers + "Status" column
        resultCsv = headers.join(',') + ',Status\n';
        
        // Add rows with original data + status message
        processedRows.forEach(({ originalData, result }) => {
            const rowValues = headers.map(header => {
                const value = originalData[header] || '';
                // Escape commas and quotes in CSV values
                if (value.includes(',') || value.includes('"') || value.includes('\n')) {
                    return `"${String(value).replace(/"/g, '""')}"`;
                }
                return String(value);
            });
            // Add status message (escape it too)
            const statusMessage = result.message || '';
            const escapedStatus = statusMessage.includes(',') || statusMessage.includes('"') || statusMessage.includes('\n')
                ? `"${statusMessage.replace(/"/g, '""')}"`
                : statusMessage;
            resultCsv += rowValues.join(',') + ',' + escapedStatus + '\n';
        });
    }

    // Total should be the number of rows processed (should equal rows.length, but use processedRows as source of truth)
    const totalRows = totalProcessed || rows.length;
    
    // Final verification: inserted + failed must equal total
    const finalTotal = inserted + failed;
    
    return {
        inserted,
        failed,
        results,
        total: finalTotal, // Total should always equal inserted + failed
        resultCsv, // CSV with original data + status column
    };
};

module.exports.generateSampleCsv = generateSampleCsv;
module.exports.bulkUploadFromCsv = bulkUploadFromCsv;
