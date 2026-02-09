const jwt = require("jsonwebtoken");
const constants = require("./constants");

const accessToken = (user) => {
  const payload = { id: user.id, email: user.email, role_id: user.role_id };
  if (user.tenant_id != null) payload.tenant_id = user.tenant_id;
  return jwt.sign(payload, process.env.JWT_SECRET_ACCESS_TOKEN, {
    expiresIn: process.env.JWT_ACCESS_TOKEN_EXPIRY || constants.TOKEN_EXPIRY.ACCESS_TOKEN,
  });
};

const refreshToken = (user) => {
  const payload = { id: user.id, email: user.email, role_id: user.role_id };
  if (user.tenant_id != null) payload.tenant_id = user.tenant_id;
  return jwt.sign(payload, process.env.JWT_SECRET_REFRESH_TOKEN, {
    expiresIn: constants.TOKEN_EXPIRY.REFRESH_TOKEN,
  });
};

const verifyToken = (token, secret) => {
  return jwt.verify(token, secret);
};

module.exports = { accessToken, refreshToken, verifyToken };
