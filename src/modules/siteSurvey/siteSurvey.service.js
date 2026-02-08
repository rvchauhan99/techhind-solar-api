const { SiteSurvey, SiteVisit, User } = require("../../models");
const { Op } = require("sequelize");

/**
 * Create a new site survey
 */
const createSiteSurvey = async (payload) => {
    // Validate that site_visit_id exists and is "visited"
    const siteVisit = await SiteVisit.findByPk(payload.site_visit_id);

    if (!siteVisit) {
        throw new Error("Site visit not found");
    }

    if (siteVisit.visit_status?.toLowerCase() !== "visited") {
        throw new Error("Site survey can only be created for visited site visits");
    }

    // Check if survey already exists for this site visit
    const existingSurvey = await SiteSurvey.findOne({
        where: { site_visit_id: payload.site_visit_id },
    });

    if (existingSurvey) {
        throw new Error("Site survey already exists for this site visit");
    }

    // Create the survey
    const survey = await SiteSurvey.create(payload);

    // Fetch with associations
    const createdSurvey = await SiteSurvey.findByPk(survey.id, {
        include: [
            {
                model: SiteVisit,
                as: "siteVisit",
            },
            {
                model: User,
                as: "surveyor",
                attributes: ["id", "name", "email"],
            },
        ],
    });

    return createdSurvey;
};

module.exports = {
    createSiteSurvey,
};
