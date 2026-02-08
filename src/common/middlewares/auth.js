const jwt = require("jsonwebtoken");
const AppError = require("../errors/AppError.js");
const { RESPONSE_STATUS_CODES } = require("../utils/constants.js");
const db = require("../../models/index.js");
const authService = require("../../modules/auth/auth.service.js");

const validateAccessToken = async (req, res, next) => {
  try {
    const authHeader = req.headers["authorization"];

    const token = authHeader?.split(" ")[1];

    if (!token) {
      return next(
        new AppError(
          "Access Token Missing",
          RESPONSE_STATUS_CODES.ACCESS_TOKEN_EXPIRED
        )
      );
    }

    try {
      await authService.checkedToken(token);

      const decoded = jwt.verify(token, process.env.JWT_SECRET_ACCESS_TOKEN);

      req.user = decoded;

      const userToken = await db.UserToken.findOne({
        where: { user_id: decoded.id, access_token: token },
      });

      if (!userToken) {
        return next(
          new AppError(
            "Access Token Missing",
            RESPONSE_STATUS_CODES.ACCESS_TOKEN_EXPIRED
          )
        );
      }

      return next();
    } catch (err) {
      if (err.name === "TokenExpiredError") {
        return next(
          new AppError(
            "Access token has expired",
            RESPONSE_STATUS_CODES.ACCESS_TOKEN_EXPIRED
          )
        );
      }

      return next(
        new AppError(
          "Unauthorized, Invalid access token",
          RESPONSE_STATUS_CODES.UNAUTHORIZED
        )
      );
    }
  } catch (err) {
    return next(
      new AppError(
        "Authentication failed",
        RESPONSE_STATUS_CODES.INTERNAL_SERVER_ERROR
      )
    );
  }
};

module.exports = { validateAccessToken };
