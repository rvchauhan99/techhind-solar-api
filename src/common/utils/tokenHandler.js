const jwt = require("jsonwebtoken");
const constants = require("./constants");

const accessToken = (user) => {
  return jwt.sign(
    { id: user.id, email: user.email, role_id : user.role_id },
    process.env.JWT_SECRET_ACCESS_TOKEN,
    {
      expiresIn: constants.TOKEN_EXPIRY.ACCESS_TOKEN,
    }
  );
};

const refreshToken = (user) => {
  return jwt.sign(
    { id: user.id, email: user.email, role_id : user.role_id },
    process.env.JWT_SECRET_REFRESH_TOKEN,
    {
      expiresIn: constants.TOKEN_EXPIRY.REFRESH_TOKEN,
    }
  );
};

const verifyToken = (token, secret) => {
  return jwt.verify(token, secret);
};

module.exports = { accessToken, refreshToken, verifyToken };
