const nodemailer = require("nodemailer");
require("dotenv").config();

// Create a transporter with Brevo SMTP configuration
const transporter = nodemailer.createTransport({
  host: "smtp-relay.brevo.com",
  port: 587,
  secure: false, // Use TLS - false for port 587
  auth: {
    user: process.env.BREVO_USER, // Your Brevo login
    pass: process.env.BREVO_MASTER_KEY, // Your Brevo master key
  },
});

/**
 * Generic email sending function
 * @param {string} to - Recipient email address
 * @param {string} subject - Email subject
 * @param {string} text - Plain text body
 * @param {string} html - HTML body (optional)
 * @param {Array} attachments - Array of attachment objects (optional) [{ filename, path }]
 * @returns {Promise} - Email info or throws error
 */
async function sendEmail(to, subject, text, html = null, attachments = []) {
  try {
    // In development, you can optionally log instead of sending
    // Uncomment below to skip actual email sending in development
    // if (process.env.NODE_ENV === "development") {
    //   console.log("Email would be sent:", { to, subject, text, html });
    //   return { success: true, message: "Email logged (dev mode)" };
    // }

    const mailOptions = {
      from: `'Solar Management System' <${process.env.BREVO_FROM}>`, // sender address
      to: to, // list of receivers
      subject: subject, // Subject line
      text: text, // plain text body
      html: html, // HTML body
      attachments: attachments, // Array of attachments
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("Email sent successfully:", info.messageId);
    return info;
  } catch (error) {
    console.error("Error sending email:", error.message);
    throw new Error("Error while sending email");
  }
}

/**
 * Generate HTML template for password reset email
 * @param {string} otp - 6-digit OTP code
 * @param {string} userName - User's name (optional)
 * @returns {string} - HTML email template
 */
function generatePasswordResetEmailHTML(otp, userName = "User") {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f8f9fa;">
      <div style="background-color: #ffffff; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
        <div style="text-align: center; margin-bottom: 30px;">
          <h2 style="color: #333; margin: 0; font-size: 24px;">Password Reset Request</h2>
        </div>
        
        <div style="margin-bottom: 25px;">
          <p style="color: #555; font-size: 16px; line-height: 1.6; margin: 0 0 15px 0;">
            Hello ${userName},
          </p>
          <p style="color: #555; font-size: 16px; line-height: 1.6; margin: 0 0 15px 0;">
            You have requested to reset your password for your Solar Management System account. 
            Please use the following OTP (One-Time Password) to complete the password reset process:
          </p>
        </div>
        
        <div style="text-align: center; margin: 30px 0; padding: 20px; background-color: #f0f4f8; border-radius: 6px; border: 2px dashed #4a90e2;">
          <div style="font-size: 36px; font-weight: bold; color: #4a90e2; letter-spacing: 8px; font-family: 'Courier New', monospace;">
            ${otp}
          </div>
        </div>
        
        <div style="margin-bottom: 25px;">
          <p style="color: #555; font-size: 16px; line-height: 1.6; margin: 0 0 15px 0;">
            <strong>Important:</strong>
          </p>
          <ul style="color: #555; font-size: 14px; line-height: 1.8; margin: 0; padding-left: 20px;">
            <li>This OTP is valid for <strong>10 minutes</strong> only</li>
            <li>Do not share this OTP with anyone</li>
            <li>If you did not request this password reset, please ignore this email</li>
          </ul>
        </div>
        
        <div style="margin-top: 30px; padding: 15px; background-color: #fff3cd; border-left: 4px solid #ffc107; border-radius: 4px;">
          <p style="margin: 0; color: #856404; font-size: 13px; line-height: 1.6;">
            <strong>Security Notice:</strong> For your security, this OTP will expire in 10 minutes. 
            If you did not request a password reset, please contact your administrator immediately.
          </p>
        </div>
        
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e0e0e0;">
          <p style="color: #999; font-size: 12px; margin: 0; text-align: center;">
            This is an automated email. Please do not reply to this message.
          </p>
        </div>
      </div>
    </div>
  `;
}

/**
 * Send password reset OTP email
 * @param {string} to - Recipient email address
 * @param {string} otp - 6-digit OTP code
 * @param {string} userName - User's name (optional)
 * @returns {Promise} - Email info
 */
async function sendPasswordResetEmail(to, otp, userName = "User") {
  try {
    const subject = "Password Reset - Solar Management System";
    const text = `Your password reset OTP is: ${otp}. This OTP is valid for 10 minutes. If you did not request this, please ignore this email.`;
    const html = generatePasswordResetEmailHTML(otp, userName);

    return await sendEmail(to, subject, text, html);
  } catch (error) {
    console.error("Error sending password reset email:", error.message);
    throw new Error("Error while sending password reset email");
  }
}

module.exports = {
  sendEmail,
  sendPasswordResetEmail,
  generatePasswordResetEmailHTML,
};
