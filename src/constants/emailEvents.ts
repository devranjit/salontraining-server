export type EmailEventKey =
  | "auth.otp"
  | "auth.registration-otp"
  | "auth.registered"
  | "auth.login"
  | "auth.password-reset"
  | "auth.password-changed"
  | "auth.email-change-otp"
  | "auth.email-changed"
  | "auth.account-deleted"
  | "auth.registration-locked"
  | "auth.account-unlocked"
  | "admin.recycle-bin-warning"
  | "admin.password-set"
  | "admin.password-reset-request"
  | "admin.temp-password"
  | "order.paid"
  | "order.pending"
  | "order.free-order"
  | "order.processing"
  | "order.shipped"
  | "order.out-for-delivery"
  | "order.delivered"
  | "order.cancelled"
  | "order.refunded"
  | "order.invoice"
  | "listing.submitted"
  | "listing.approved"
  | "listing.rejected"
  | "listing.edit-requested"
  | "listing.updated"
  | "job.submitted"
  | "job.approved"
  | "job.rejected"
  | "membership.activated";

export type EmailEventConfig = {
  key: EmailEventKey;
  label: string;
  description: string;
  defaultSubject: string;
  defaultHtml: string;
};

export const EMAIL_EVENTS: EmailEventConfig[] = [
  {
    key: "auth.otp",
    label: "Authentication OTP",
    description: "Sent when a user requests a login or password reset code.",
    defaultSubject: "Your SalonTraining verification code",
    defaultHtml: `
      <h1 style="color:#d57a2c;margin-bottom:16px;">Your verification code</h1>
      <p style="font-size:16px;color:#333;">Hi {{user.name}},</p>
      <p style="color:#555;">Use the code below to continue:</p>
      <div style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#fff;background:#d57a2c;padding:12px 24px;border-radius:12px;text-align:center;">
        {{otp}}
      </div>
      <p style="color:#777;font-size:12px;margin-top:24px;">This code expires in 5 minutes.</p>
    `,
  },
  {
    key: "auth.registration-otp",
    label: "Registration Verification OTP",
    description: "Sent when a new user registers to verify their email address.",
    defaultSubject: "Verify your email to complete registration",
    defaultHtml: `
      <h1 style="color:#d57a2c;margin-bottom:16px;">Verify Your Email</h1>
      <p style="font-size:16px;color:#333;">Hi {{user.name}},</p>
      <p style="color:#555;">Thank you for registering with SalonTraining! Please enter the verification code below to complete your registration:</p>
      <div style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#fff;background:#d57a2c;padding:12px 24px;border-radius:12px;text-align:center;margin:24px 0;">
        {{otp}}
      </div>
      <p style="color:#777;font-size:12px;">This code expires in 5 minutes.</p>
      <p style="color:#777;font-size:12px;margin-top:16px;">If you did not create an account, please ignore this email.</p>
    `,
  },
  {
    key: "auth.registration-locked",
    label: "Registration Locked",
    description: "Sent when a user's registration is locked due to too many failed verification attempts.",
    defaultSubject: "Your SalonTraining registration has been locked",
    defaultHtml: `
      <h1 style="color:#dc2626;margin-bottom:16px;">Registration Locked</h1>
      <p style="font-size:16px;color:#333;">Hi {{user.name}},</p>
      <p style="color:#555;">Your registration attempt has been locked due to too many failed verification attempts.</p>
      <p style="color:#555;">If you believe this was a mistake, please contact our support team to unlock your registration.</p>
      <p style="color:#777;font-size:12px;margin-top:24px;">Contact support at support@salontraining.com</p>
    `,
  },
  {
    key: "auth.account-unlocked",
    label: "Account Unlocked",
    description: "Sent when an admin unlocks a locked user account.",
    defaultSubject: "Your SalonTraining account has been unlocked",
    defaultHtml: `
      <h1 style="color:#16a34a;margin-bottom:16px;">Account Unlocked</h1>
      <p style="font-size:16px;color:#333;">Hi {{user.name}},</p>
      <p style="color:#555;">Good news! Your SalonTraining account has been unlocked by our support team.</p>
      <p style="color:#555;">You can now register again or log in to your account.</p>
      <p style="text-align:center;margin-top:24px;">
        <a href="{{app.url}}/register" style="background:#d57a2c;color:#fff;text-decoration:none;padding:12px 32px;border-radius:999px;font-weight:bold;">Register Now</a>
      </p>
    `,
  },
  {
    key: "auth.registered",
    label: "Welcome Email",
    description: "Triggered when a new account is created.",
    defaultSubject: "Welcome to SalonTraining",
    defaultHtml: `
      <h1 style="color:#0f172a;">Welcome, {{user.name}}!</h1>
      <p style="color:#475569;">You now have access to salon educators, events, and listings tailored for beauty professionals.</p>
      <p style="color:#475569;">Sign in anytime at <a href="{{app.url}}" style="color:#d57a2c;">SalonTraining.com</a>.</p>
    `,
  },
  {
    key: "auth.login",
    label: "Login Alert",
    description: "Sent when an account successfully signs in.",
    defaultSubject: "New login on SalonTraining",
    defaultHtml: `
      <p style="color:#0f172a;">Hi {{user.name}},</p>
      <p style="color:#475569;">Your account just logged in on {{context.timestamp}} from {{context.location}}.</p>
    `,
  },
  {
    key: "auth.password-reset",
    label: "Password Reset",
    description: "Sent when a password reset link is requested.",
    defaultSubject: "Reset your SalonTraining password",
    defaultHtml: `
      <h1 style="color:#0f172a;">Reset your password</h1>
      <p style="color:#475569;">Hi {{user.name}}, click the button below to set a new password.</p>
      <p style="text-align:center;">
        <a href="{{reset.url}}" style="background:#d57a2c;color:#fff;text-decoration:none;padding:12px 32px;border-radius:999px;font-weight:bold;">Reset Password</a>
      </p>
      <p style="color:#94a3b8;font-size:12px;">The link expires in 60 minutes.</p>
    `,
  },
  {
    key: "auth.password-changed",
    label: "Password Changed",
    description: "Sent when a user successfully changes their password.",
    defaultSubject: "Your SalonTraining password has been changed",
    defaultHtml: `
      <h1 style="color:#16a34a;margin-bottom:16px;">Password Changed</h1>
      <p style="font-size:16px;color:#333;">Hi {{user.name}},</p>
      <p style="color:#555;">Your password was successfully changed on {{context.timestamp}}.</p>
      <p style="color:#555;">If you did not make this change, please contact our support team immediately.</p>
      <p style="color:#777;font-size:12px;margin-top:24px;">Contact support at support@salontraining.com</p>
    `,
  },
  {
    key: "auth.email-change-otp",
    label: "Email Change Verification",
    description: "Sent to the new email address when a user requests to change their email.",
    defaultSubject: "Verify your new email address - SalonTraining",
    defaultHtml: `
      <h1 style="color:#d57a2c;margin-bottom:16px;">Verify your new email</h1>
      <p style="font-size:16px;color:#333;">Hi {{user.name}},</p>
      <p style="color:#555;">Someone requested to change the email on a SalonTraining account from <strong>{{currentEmail}}</strong> to this email address.</p>
      <p style="color:#555;">Use the code below to verify this email address:</p>
      <div style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#fff;background:#d57a2c;padding:12px 24px;border-radius:12px;text-align:center;margin:24px 0;">
        {{otp}}
      </div>
      <p style="color:#777;font-size:12px;">This code expires in 5 minutes.</p>
      <p style="color:#777;font-size:12px;margin-top:16px;">If you did not request this change, please ignore this email.</p>
    `,
  },
  {
    key: "auth.email-changed",
    label: "Email Changed Notification",
    description: "Sent to the old email address when a user successfully changes their email.",
    defaultSubject: "Your SalonTraining email has been changed",
    defaultHtml: `
      <h1 style="color:#f59e0b;margin-bottom:16px;">Email Address Changed</h1>
      <p style="font-size:16px;color:#333;">Hi {{user.name}},</p>
      <p style="color:#555;">The email address on your SalonTraining account has been changed to <strong>{{newEmail}}</strong> on {{context.timestamp}}.</p>
      <p style="color:#555;">If you did not make this change, please contact our support team immediately as your account may have been compromised.</p>
      <p style="color:#777;font-size:12px;margin-top:24px;">Contact support at support@salontraining.com</p>
    `,
  },
  {
    key: "auth.account-deleted",
    label: "Account Deleted",
    description: "Sent when a user permanently deletes their account.",
    defaultSubject: "Your SalonTraining account has been deleted",
    defaultHtml: `
      <h1 style="color:#dc2626;margin-bottom:16px;">Account Deleted</h1>
      <p style="font-size:16px;color:#333;">Hi {{user.name}},</p>
      <p style="color:#555;">Your SalonTraining account has been permanently deleted on {{context.timestamp}}.</p>
      <p style="color:#555;">All your data has been removed from our systems.</p>
      <p style="color:#555;">If you ever want to return, you're welcome to create a new account at any time.</p>
      <p style="color:#777;font-size:12px;margin-top:24px;">Thank you for being part of SalonTraining. We hope to see you again!</p>
    `,
  },
  {
    key: "admin.recycle-bin-warning",
    label: "Recycle Bin Warning",
    description: "Notifies admins about items scheduled for permanent deletion.",
    defaultSubject: "Recycle bin items scheduled for removal",
    defaultHtml: `
      <h1 style="color:#0f172a;">Upcoming permanent deletions</h1>
      <p style="color:#475569;">The following items will be removed in 5 days:</p>
      <ul>
        {{#items}}
          <li><strong>{{entityType}}</strong> – {{metadata.title}}{{metadata.name}} (Deleted {{deletedAt}})</li>
        {{/items}}
      </ul>
    `,
  },
  {
    key: "admin.password-set",
    label: "Admin Password Set",
    description: "Sent when an administrator sets a new password for a user.",
    defaultSubject: "Your SalonTraining password has been changed by an administrator",
    defaultHtml: `
      <h1 style="color:#f59e0b;margin-bottom:16px;">Password Changed by Administrator</h1>
      <p style="font-size:16px;color:#333;">Hi {{user.name}},</p>
      <p style="color:#555;">An administrator has reset your password on {{context.timestamp}}.</p>
      <p style="color:#555;">If you did not request this change, please contact our support team immediately.</p>
      <p style="margin-top:24px;">
        <a href="{{app.url}}/login" style="background:#d57a2c;color:#fff;text-decoration:none;padding:12px 32px;border-radius:999px;font-weight:bold;">Log In Now</a>
      </p>
      <p style="color:#777;font-size:12px;margin-top:24px;">Contact support at support@salontraining.com</p>
    `,
  },
  {
    key: "admin.password-reset-request",
    label: "Admin Password Reset Request",
    description: "Sent when an administrator triggers a password reset for a user.",
    defaultSubject: "Password reset requested by administrator - SalonTraining",
    defaultHtml: `
      <h1 style="color:#d57a2c;margin-bottom:16px;">Password Reset Requested</h1>
      <p style="font-size:16px;color:#333;">Hi {{user.name}},</p>
      <p style="color:#555;">An administrator has requested a password reset for your account.</p>
      <p style="color:#555;">Click the button below to set a new password:</p>
      <p style="text-align:center;margin:24px 0;">
        <a href="{{reset.url}}" style="background:#d57a2c;color:#fff;text-decoration:none;padding:12px 32px;border-radius:999px;font-weight:bold;">Reset Password</a>
      </p>
      <p style="color:#94a3b8;font-size:12px;">This link expires in {{reset.expiresIn}}.</p>
      <p style="color:#777;font-size:12px;margin-top:24px;">If you did not expect this email, please contact support at support@salontraining.com</p>
    `,
  },
  {
    key: "admin.temp-password",
    label: "Admin Temporary Password",
    description: "Sent when an administrator generates a temporary password for a user.",
    defaultSubject: "Your temporary SalonTraining password",
    defaultHtml: `
      <h1 style="color:#f59e0b;margin-bottom:16px;">Temporary Password Generated</h1>
      <p style="font-size:16px;color:#333;">Hi {{user.name}},</p>
      <p style="color:#555;">An administrator has generated a temporary password for your account.</p>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:20px;margin:24px 0;text-align:center;">
        <p style="color:#64748b;font-size:12px;margin:0 0 8px;text-transform:uppercase;letter-spacing:0.1em;">Your Temporary Password</p>
        <p style="font-size:24px;font-weight:bold;color:#0f172a;margin:0;letter-spacing:2px;font-family:monospace;">{{tempPassword}}</p>
      </div>
      <div style="background:#fef3c7;border-left:4px solid #f59e0b;padding:16px;border-radius:0 8px 8px 0;margin:20px 0;">
        <p style="margin:0;color:#92400e;font-size:14px;"><strong>Important:</strong> Please log in and change this password immediately for security.</p>
      </div>
      <p style="text-align:center;margin-top:24px;">
        <a href="{{app.url}}/login" style="background:#d57a2c;color:#fff;text-decoration:none;padding:12px 32px;border-radius:999px;font-weight:bold;">Log In Now</a>
      </p>
      <p style="color:#777;font-size:12px;margin-top:24px;">If you did not expect this email, please contact support at support@salontraining.com</p>
    `,
  },
  {
    key: "order.paid",
    label: "Order Paid (Store Catalog)",
    description: "Sent to buyers after successful catalog checkout payment.",
    defaultSubject: "Order Confirmed #{{order.number}} - SalonTraining",
    defaultHtml: `
      <div style="max-width:640px;margin:0 auto;font-family:'Segoe UI',Helvetica,Arial,sans-serif;color:#1e293b;background:#ffffff;">
        <!-- Header with Brand -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);border-radius:16px 16px 0 0;">
          <tr>
            <td style="padding:32px 28px 28px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td>
                    <p style="margin:0 0 4px;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:#94a3b8;">Order Confirmation</p>
                    <h1 style="margin:0;font-size:26px;font-weight:700;color:#ffffff;">Thanks for your order!</h1>
                  </td>
                  <td style="text-align:right;vertical-align:top;">
                    <div style="display:inline-block;background:#f97316;border-radius:24px;padding:6px 14px;">
                      <span style="color:#ffffff;font-size:12px;font-weight:600;letter-spacing:0.05em;">CONFIRMED</span>
                    </div>
                  </td>
                </tr>
              </table>
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:16px;">
                <tr>
                  <td style="color:#cbd5e1;font-size:14px;">
                    Hi <strong style="color:#ffffff;">{{user.name}}</strong>, we've received your order and it's being processed.
                  </td>
                </tr>
              </table>
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:16px;background:rgba(255,255,255,0.1);border-radius:10px;padding:12px 16px;">
                <tr>
                  <td style="padding:12px 16px;">
                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="color:#94a3b8;font-size:12px;text-transform:uppercase;letter-spacing:0.08em;">Order Number</td>
                        <td style="text-align:right;color:#94a3b8;font-size:12px;text-transform:uppercase;letter-spacing:0.08em;">Date</td>
                      </tr>
                      <tr>
                        <td style="color:#ffffff;font-size:16px;font-weight:700;padding-top:4px;">{{order.number}}</td>
                        <td style="text-align:right;color:#ffffff;font-size:14px;padding-top:4px;">{{order.date}}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>

        <!-- Order Items Section -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">
          <tr>
            <td style="padding:28px;">
              <h2 style="margin:0 0 20px;font-size:15px;font-weight:700;color:#0f172a;text-transform:uppercase;letter-spacing:0.08em;border-bottom:2px solid #0f172a;padding-bottom:10px;display:inline-block;">Your Items</h2>
              
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                {{order.itemsHtml}}
              </table>

              <!-- Order Summary Box -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;background:linear-gradient(135deg,#f8fafc 0%,#f1f5f9 100%);border-radius:12px;">
                <tr>
                  <td style="padding:20px;">
                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="padding:6px 0;font-size:14px;color:#64748b;">Subtotal</td>
                        <td style="padding:6px 0;font-size:14px;color:#0f172a;text-align:right;font-weight:500;">\${{order.totals.items}}</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;font-size:14px;color:#64748b;">Shipping</td>
                        <td style="padding:6px 0;font-size:14px;color:#0f172a;text-align:right;font-weight:500;">\${{order.totals.shipping}}</td>
                      </tr>
                      {{order.discountHtml}}
                      <tr>
                        <td colspan="2" style="padding-top:12px;border-top:2px dashed #cbd5e1;"></td>
                      </tr>
                      <tr>
                        <td style="padding:8px 0;font-size:18px;font-weight:700;color:#0f172a;">Total Paid</td>
                        <td style="padding:8px 0;font-size:22px;font-weight:700;color:#0f172a;text-align:right;">\${{order.totals.grand}}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>

        <!-- Shipping & Contact Info -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">
          <tr>
            <td style="padding:0 28px 28px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td width="48%" style="vertical-align:top;">
                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0;">
                      <tr>
                        <td style="padding:18px;">
                          <p style="margin:0 0 10px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.1em;">
                            <span style="margin-right:6px;">📍</span> Shipping To
                          </p>
                          <p style="margin:0;font-size:14px;font-weight:600;color:#0f172a;">{{order.shippingName}}</p>
                          <p style="margin:6px 0 0;font-size:13px;color:#475569;line-height:1.5;white-space:pre-line;">{{order.shippingAddress}}</p>
                          <p style="margin:10px 0 0;font-size:12px;color:#64748b;">
                            <span style="background:#dbeafe;color:#1e40af;padding:3px 8px;border-radius:4px;font-weight:500;">{{order.shippingMethod}}</span>
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                  <td width="4%"></td>
                  <td width="48%" style="vertical-align:top;">
                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0;">
                      <tr>
                        <td style="padding:18px;">
                          <p style="margin:0 0 10px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.1em;">
                            <span style="margin-right:6px;">📧</span> Contact Details
                          </p>
                          <p style="margin:0;font-size:13px;color:#475569;"><strong>Email:</strong> {{order.contactEmail}}</p>
                          <p style="margin:6px 0 0;font-size:13px;color:#475569;"><strong>Phone:</strong> {{order.contactPhone}}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>

        <!-- Footer -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 16px 16px;">
          <tr>
            <td style="padding:24px 28px;text-align:center;">
              <p style="margin:0 0 8px;font-size:14px;color:#475569;">We'll send you shipping updates as your order progresses.</p>
              <p style="margin:0;font-size:13px;color:#94a3b8;">Questions? Just reply to this email — we're here to help!</p>
            </td>
          </tr>
        </table>
      </div>
    `,
  },
  {
    key: "listing.submitted",
    label: "Listing Submitted",
    description: "Sent to listing owners when they submit a new listing.",
    defaultSubject: "We received your listing submission",
    defaultHtml: `
      <p style="color:#0f172a;">Thanks for submitting <strong>{{listing.title}}</strong>.</p>
      <p style="color:#475569;">Our team will review it shortly and keep you posted.</p>
    `,
  },
  {
    key: "listing.approved",
    label: "Listing Approved",
    description: "Sent when admins approve a listing.",
    defaultSubject: "Your listing is live!",
    defaultHtml: `
      <p style="color:#0f172a;">Great news!</p>
      <p style="color:#475569;"><strong>{{listing.title}}</strong> is now live on SalonTraining.</p>
      <p><a href="{{listing.url}}" style="color:#d57a2c;">View listing</a></p>
    `,
  },
  {
    key: "listing.rejected",
    label: "Listing Rejected",
    description: "Sent when admins reject a listing.",
    defaultSubject: "Update on your listing",
    defaultHtml: `
      <p style="color:#0f172a;">Hi {{user.name}},</p>
      <p style="color:#475569;">We weren't able to approve <strong>{{listing.title}}</strong>.</p>
      <p style="color:#475569;">Reason: {{listing.reason}}</p>
    `,
  },
  {
    key: "listing.edit-requested",
    label: "Listing Edit Requested",
    description: "Sent when admins request changes.",
    defaultSubject: "Changes requested for your listing",
    defaultHtml: `
      <p>Please update <strong>{{listing.title}}</strong>:</p>
      <p>{{listing.reason}}</p>
    `,
  },
  {
    key: "listing.updated",
    label: "Listing Updated",
    description: "Internal confirmation after listing edit.",
    defaultSubject: "Listing updated successfully",
    defaultHtml: `
      <p><strong>{{listing.title}}</strong> has been updated.</p>
    `,
  },
  {
    key: "job.submitted",
    label: "Job Submitted",
    description: "Triggered when a new job post is submitted.",
    defaultSubject: "We received your job post",
    defaultHtml: `
      <p>Thanks for posting <strong>{{job.title}}</strong>.</p>
    `,
  },
  {
    key: "job.approved",
    label: "Job Approved",
    description: "Triggered when a job post is approved.",
    defaultSubject: "Your job post is live",
    defaultHtml: `
      <p><strong>{{job.title}}</strong> is now live.</p>
      <p><a href="{{job.url}}" style="color:#d57a2c;">View job</a></p>
    `,
  },
  {
    key: "job.rejected",
    label: "Job Rejected",
    description: "Triggered when a job post is rejected.",
    defaultSubject: "Job post requires changes",
    defaultHtml: `
      <p>We were unable to approve <strong>{{job.title}}</strong>.</p>
      <p>Reason: {{job.reason}}</p>
    `,
  },
  {
    key: "membership.activated",
    label: "Membership Activated",
    description: "Sent to members when a membership becomes active or renews.",
    defaultSubject: "Your SalonTraining membership is active",
    defaultHtml: `
      <h1 style="color:#0f172a;">You're all set, {{user.name}}!</h1>
      <p style="color:#475569;">Your <strong>{{plan.name}}</strong> membership is now active.</p>
      <ul style="color:#475569;line-height:1.6;">
        <li>Plan: {{plan.name}}</li>
        <li>Price: {{plan.price}} / {{plan.interval}}</li>
        <li>Expires: {{membership.expiryDate}}</li>
      </ul>
      <p style="margin-top:16px;">{{membership.invoiceCta}}</p>
      <p style="color:#94a3b8;font-size:13px;margin-top:24px;">Need help? Reply to this email.</p>
    `,
  },
  {
    key: "order.shipped",
    label: "Order Shipped",
    description: "Sent when an order is marked as shipped with tracking info.",
    defaultSubject: "Your order #{{order.number}} has shipped! 📦",
    defaultHtml: `
      <div style="max-width:640px;margin:0 auto;font-family:'Segoe UI',Helvetica,Arial,sans-serif;color:#1e293b;background:#ffffff;">
        <!-- Header -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:linear-gradient(135deg,#1e40af 0%,#3b82f6 100%);border-radius:16px 16px 0 0;">
          <tr>
            <td style="padding:32px 28px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td>
                    <p style="margin:0 0 4px;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:#bfdbfe;">Shipping Update</p>
                    <h1 style="margin:0;font-size:26px;font-weight:700;color:#ffffff;">Your order is on its way!</h1>
                  </td>
                  <td style="text-align:right;vertical-align:top;">
                    <div style="display:inline-block;background:#ffffff;border-radius:24px;padding:6px 14px;">
                      <span style="color:#1e40af;font-size:12px;font-weight:600;">SHIPPED</span>
                    </div>
                  </td>
                </tr>
              </table>
              <p style="margin:16px 0 0;color:#dbeafe;font-size:14px;">Hi <strong style="color:#ffffff;">{{user.name}}</strong>, great news! Your order has been shipped.</p>
            </td>
          </tr>
        </table>

        <!-- Order Info -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">
          <tr>
            <td style="padding:28px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f0f9ff;border-radius:12px;border:1px solid #bae6fd;">
                <tr>
                  <td style="padding:20px;">
                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="color:#0369a1;font-size:12px;text-transform:uppercase;letter-spacing:0.08em;">Order Number</td>
                        <td style="text-align:right;color:#0369a1;font-size:12px;text-transform:uppercase;letter-spacing:0.08em;">Shipped Date</td>
                      </tr>
                      <tr>
                        <td style="color:#0c4a6e;font-size:18px;font-weight:700;padding-top:4px;">{{order.number}}</td>
                        <td style="text-align:right;color:#0c4a6e;font-size:14px;padding-top:4px;">{{order.shippedDate}}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Tracking Info -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:20px;background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0;">
                <tr>
                  <td style="padding:20px;">
                    <p style="margin:0 0 12px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.1em;">📍 Tracking Information</p>
                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="padding:8px 0;border-bottom:1px solid #e2e8f0;">
                          <span style="color:#64748b;font-size:13px;">Carrier</span>
                        </td>
                        <td style="padding:8px 0;border-bottom:1px solid #e2e8f0;text-align:right;">
                          <span style="color:#0f172a;font-size:14px;font-weight:600;">{{order.carrier}}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:8px 0;border-bottom:1px solid #e2e8f0;">
                          <span style="color:#64748b;font-size:13px;">Tracking Number</span>
                        </td>
                        <td style="padding:8px 0;border-bottom:1px solid #e2e8f0;text-align:right;">
                          <span style="color:#1e40af;font-size:14px;font-weight:600;">{{order.trackingNumber}}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:8px 0;">
                          <span style="color:#64748b;font-size:13px;">Estimated Delivery</span>
                        </td>
                        <td style="padding:8px 0;text-align:right;">
                          <span style="color:#0f172a;font-size:14px;font-weight:600;">{{order.estimatedDelivery}}</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Items Summary -->
              <div style="margin-top:20px;">
                <p style="margin:0 0 12px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.1em;">📦 Items in this shipment</p>
                <table width="100%" cellpadding="0" cellspacing="0" border="0">
                  {{order.itemsHtml}}
                </table>
              </div>

              <!-- Shipping Address -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:20px;background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0;">
                <tr>
                  <td style="padding:18px;">
                    <p style="margin:0 0 10px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.1em;">🏠 Delivering To</p>
                    <p style="margin:0;font-size:14px;font-weight:600;color:#0f172a;">{{order.shippingName}}</p>
                    <p style="margin:6px 0 0;font-size:13px;color:#475569;line-height:1.5;white-space:pre-line;">{{order.shippingAddress}}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>

        <!-- Footer -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 16px 16px;">
          <tr>
            <td style="padding:24px 28px;text-align:center;">
              <p style="margin:0 0 8px;font-size:14px;color:#475569;">We'll notify you when your package is delivered.</p>
              <p style="margin:0;font-size:13px;color:#94a3b8;">Questions? Just reply to this email.</p>
            </td>
          </tr>
        </table>
      </div>
    `,
  },
  {
    key: "order.out-for-delivery",
    label: "Order Out for Delivery",
    description: "Sent when order is out for delivery.",
    defaultSubject: "Your order #{{order.number}} is out for delivery! 🚚",
    defaultHtml: `
      <div style="max-width:640px;margin:0 auto;font-family:'Segoe UI',Helvetica,Arial,sans-serif;color:#1e293b;background:#ffffff;">
        <!-- Header -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:linear-gradient(135deg,#7c3aed 0%,#a855f7 100%);border-radius:16px 16px 0 0;">
          <tr>
            <td style="padding:32px 28px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td>
                    <p style="margin:0 0 4px;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:#e9d5ff;">Delivery Update</p>
                    <h1 style="margin:0;font-size:26px;font-weight:700;color:#ffffff;">It's arriving today!</h1>
                  </td>
                  <td style="text-align:right;vertical-align:top;">
                    <div style="display:inline-block;background:#ffffff;border-radius:24px;padding:6px 14px;">
                      <span style="color:#7c3aed;font-size:12px;font-weight:600;">OUT FOR DELIVERY</span>
                    </div>
                  </td>
                </tr>
              </table>
              <p style="margin:16px 0 0;color:#e9d5ff;font-size:14px;">Hi <strong style="color:#ffffff;">{{user.name}}</strong>, your package is on a delivery vehicle and will arrive today!</p>
            </td>
          </tr>
        </table>

        <!-- Order Info -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">
          <tr>
            <td style="padding:28px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#faf5ff;border-radius:12px;border:1px solid #e9d5ff;">
                <tr>
                  <td style="padding:20px;text-align:center;">
                    <p style="margin:0;font-size:48px;">🚚</p>
                    <p style="margin:12px 0 0;font-size:16px;font-weight:700;color:#7c3aed;">Order #{{order.number}}</p>
                    <p style="margin:4px 0 0;font-size:14px;color:#6b7280;">Expected today, {{order.deliveryDate}}</p>
                  </td>
                </tr>
              </table>

              <!-- Delivery Address -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:20px;background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0;">
                <tr>
                  <td style="padding:18px;">
                    <p style="margin:0 0 10px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.1em;">📍 Delivery Address</p>
                    <p style="margin:0;font-size:14px;font-weight:600;color:#0f172a;">{{order.shippingName}}</p>
                    <p style="margin:6px 0 0;font-size:13px;color:#475569;line-height:1.5;white-space:pre-line;">{{order.shippingAddress}}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>

        <!-- Footer -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 16px 16px;">
          <tr>
            <td style="padding:24px 28px;text-align:center;">
              <p style="margin:0 0 8px;font-size:14px;color:#475569;">Make sure someone is available to receive your package.</p>
              <p style="margin:0;font-size:13px;color:#94a3b8;">Questions? Just reply to this email.</p>
            </td>
          </tr>
        </table>
      </div>
    `,
  },
  {
    key: "order.delivered",
    label: "Order Delivered",
    description: "Sent when order has been delivered.",
    defaultSubject: "Your order #{{order.number}} has been delivered! 📦",
    defaultHtml: `
      <div style="max-width:640px;margin:0 auto;font-family:'Segoe UI',Helvetica,Arial,sans-serif;color:#1e293b;background:#ffffff;">
        <!-- Header -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:linear-gradient(135deg,#ea580c 0%,#f97316 100%);border-radius:16px 16px 0 0;">
          <tr>
            <td style="padding:32px 28px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td>
                    <p style="margin:0 0 4px;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:#fed7aa;">Delivery Complete</p>
                    <h1 style="margin:0;font-size:26px;font-weight:700;color:#ffffff;">Your order has arrived!</h1>
                  </td>
                  <td style="text-align:right;vertical-align:top;">
                    <div style="display:inline-block;background:#ffffff;border-radius:24px;padding:6px 14px;">
                      <span style="color:#ea580c;font-size:12px;font-weight:600;">DELIVERED</span>
                    </div>
                  </td>
                </tr>
              </table>
              <p style="margin:16px 0 0;color:#fed7aa;font-size:14px;">Hi <strong style="color:#ffffff;">{{user.name}}</strong>, your package has been successfully delivered!</p>
            </td>
          </tr>
        </table>

        <!-- Order Info -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">
          <tr>
            <td style="padding:28px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fff7ed;border-radius:12px;border:1px solid #fed7aa;">
                <tr>
                  <td style="padding:20px;text-align:center;">
                    <p style="margin:0;font-size:48px;">📦</p>
                    <p style="margin:12px 0 0;font-size:16px;font-weight:700;color:#ea580c;">Order #{{order.number}}</p>
                    <p style="margin:4px 0 0;font-size:14px;color:#6b7280;">Delivered on {{order.deliveredDate}}</p>
                  </td>
                </tr>
              </table>

              <!-- Items Delivered -->
              <div style="margin-top:20px;">
                <p style="margin:0 0 12px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.1em;">📦 Items Delivered</p>
                <table width="100%" cellpadding="0" cellspacing="0" border="0">
                  {{order.itemsHtml}}
                </table>
              </div>

              <!-- Delivered To -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:20px;background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0;">
                <tr>
                  <td style="padding:18px;">
                    <p style="margin:0 0 10px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.1em;">📍 Delivered To</p>
                    <p style="margin:0;font-size:14px;font-weight:600;color:#0f172a;">{{order.shippingName}}</p>
                    <p style="margin:6px 0 0;font-size:13px;color:#475569;line-height:1.5;white-space:pre-line;">{{order.shippingAddress}}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>

        <!-- Footer -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 16px 16px;">
          <tr>
            <td style="padding:24px 28px;text-align:center;">
              <p style="margin:0 0 8px;font-size:14px;color:#475569;">We hope you love your purchase! Thank you for shopping with us.</p>
              <p style="margin:0;font-size:13px;color:#94a3b8;">Questions or issues? Just reply to this email.</p>
            </td>
          </tr>
        </table>
      </div>
    `,
  },
  {
    key: "order.refunded",
    label: "Order Refunded",
    description: "Sent when an order has been refunded.",
    defaultSubject: "Refund processed for order #{{order.number}}",
    defaultHtml: `
      <div style="max-width:640px;margin:0 auto;font-family:'Segoe UI',Helvetica,Arial,sans-serif;color:#1e293b;background:#ffffff;">
        <!-- Header -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:linear-gradient(135deg,#475569 0%,#64748b 100%);border-radius:16px 16px 0 0;">
          <tr>
            <td style="padding:32px 28px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td>
                    <p style="margin:0 0 4px;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:#cbd5e1;">Refund Confirmation</p>
                    <h1 style="margin:0;font-size:26px;font-weight:700;color:#ffffff;">Your refund has been processed</h1>
                  </td>
                  <td style="text-align:right;vertical-align:top;">
                    <div style="display:inline-block;background:#ffffff;border-radius:24px;padding:6px 14px;">
                      <span style="color:#475569;font-size:12px;font-weight:600;">REFUNDED</span>
                    </div>
                  </td>
                </tr>
              </table>
              <p style="margin:16px 0 0;color:#cbd5e1;font-size:14px;">Hi <strong style="color:#ffffff;">{{user.name}}</strong>, we've processed a refund for your order.</p>
            </td>
          </tr>
        </table>

        <!-- Refund Details -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">
          <tr>
            <td style="padding:28px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0;">
                <tr>
                  <td style="padding:20px;">
                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="padding:8px 0;border-bottom:1px solid #e2e8f0;">
                          <span style="color:#64748b;font-size:13px;">Order Number</span>
                        </td>
                        <td style="padding:8px 0;border-bottom:1px solid #e2e8f0;text-align:right;">
                          <span style="color:#0f172a;font-size:14px;font-weight:600;">{{order.number}}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:8px 0;border-bottom:1px solid #e2e8f0;">
                          <span style="color:#64748b;font-size:13px;">Refund Amount</span>
                        </td>
                        <td style="padding:8px 0;border-bottom:1px solid #e2e8f0;text-align:right;">
                          <span style="color:#059669;font-size:16px;font-weight:700;">\${{order.refundAmount}}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:8px 0;">
                          <span style="color:#64748b;font-size:13px;">Refund Date</span>
                        </td>
                        <td style="padding:8px 0;text-align:right;">
                          <span style="color:#0f172a;font-size:14px;font-weight:600;">{{order.refundDate}}</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <div style="margin-top:20px;padding:16px;background:#fef3c7;border-radius:12px;border-left:4px solid #f59e0b;">
                <p style="margin:0;font-size:14px;color:#92400e;">
                  <strong>Note:</strong> Refunds typically take 5-10 business days to appear on your original payment method, depending on your bank.
                </p>
              </div>

              <!-- Items Refunded -->
              <div style="margin-top:20px;">
                <p style="margin:0 0 12px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.1em;">📦 Items Refunded</p>
                <table width="100%" cellpadding="0" cellspacing="0" border="0">
                  {{order.itemsHtml}}
                </table>
              </div>
            </td>
          </tr>
        </table>

        <!-- Footer -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 16px 16px;">
          <tr>
            <td style="padding:24px 28px;text-align:center;">
              <p style="margin:0 0 8px;font-size:14px;color:#475569;">We're sorry to see this order returned. We hope to serve you again soon!</p>
              <p style="margin:0;font-size:13px;color:#94a3b8;">Questions about your refund? Just reply to this email.</p>
            </td>
          </tr>
        </table>
      </div>
    `,
  },
  {
    key: "order.pending",
    label: "Order Pending",
    description: "Sent when an order is set to pending status.",
    defaultSubject: "Order #{{order.number}} - Awaiting Payment",
    defaultHtml: `
      <div style="max-width:640px;margin:0 auto;font-family:'Segoe UI',Helvetica,Arial,sans-serif;color:#1e293b;background:#ffffff;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:linear-gradient(135deg,#f59e0b 0%,#fbbf24 100%);border-radius:16px 16px 0 0;">
          <tr>
            <td style="padding:32px 28px;">
              <h1 style="margin:0;font-size:26px;font-weight:700;color:#ffffff;">Order Pending</h1>
              <p style="margin:16px 0 0;color:#fef3c7;font-size:14px;">Hi <strong style="color:#ffffff;">{{user.name}}</strong>, your order is awaiting payment.</p>
            </td>
          </tr>
        </table>
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border:1px solid #e2e8f0;border-top:none;padding:28px;">
          <tr><td>
            <p style="font-size:14px;color:#475569;">Order <strong>#{{order.number}}</strong> is currently pending. Please complete your payment to proceed.</p>
            <p style="font-size:14px;color:#475569;margin-top:16px;">{{order.itemsHtml}}</p>
          </td></tr>
        </table>
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 16px 16px;">
          <tr><td style="padding:24px 28px;text-align:center;">
            <p style="margin:0;font-size:13px;color:#94a3b8;">Questions? Reply to this email or visit <a href="{{app.url}}/orders" style="color:#d57a2c;">your orders</a>.</p>
          </td></tr>
        </table>
      </div>
    `,
  },
  {
    key: "order.free-order",
    label: "Free Order Confirmed",
    description: "Sent when a free order (100% discount) is placed.",
    defaultSubject: "Free Order Confirmed #{{order.number}} - SalonTraining",
    defaultHtml: `
      <div style="max-width:640px;margin:0 auto;font-family:'Segoe UI',Helvetica,Arial,sans-serif;color:#1e293b;background:#ffffff;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:linear-gradient(135deg,#8b5cf6 0%,#a855f7 100%);border-radius:16px 16px 0 0;">
          <tr>
            <td style="padding:32px 28px;">
              <h1 style="margin:0;font-size:26px;font-weight:700;color:#ffffff;">🎉 Free Order Confirmed!</h1>
              <p style="margin:16px 0 0;color:#e9d5ff;font-size:14px;">Hi <strong style="color:#ffffff;">{{user.name}}</strong>, great news!</p>
            </td>
          </tr>
        </table>
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border:1px solid #e2e8f0;border-top:none;padding:28px;">
          <tr><td>
            <div style="background:#f3e8ff;border:1px solid #d8b4fe;border-radius:12px;padding:16px;margin-bottom:20px;">
              <p style="margin:0;font-size:14px;color:#7c3aed;font-weight:600;">✨ No payment was required for this order.</p>
              <p style="margin:8px 0 0;font-size:13px;color:#6b7280;">Your 100% discount has been applied successfully!</p>
            </div>
            <p style="font-size:14px;color:#475569;"><strong>Order #{{order.number}}</strong></p>
            {{order.itemsHtml}}
          </td></tr>
        </table>
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 16px 16px;">
          <tr><td style="padding:24px 28px;text-align:center;">
            <p style="margin:0;font-size:13px;color:#94a3b8;">Questions? Reply to this email.</p>
          </td></tr>
        </table>
      </div>
    `,
  },
  {
    key: "order.processing",
    label: "Order Processing",
    description: "Sent when an order is being processed.",
    defaultSubject: "Order #{{order.number}} is being processed",
    defaultHtml: `
      <div style="max-width:640px;margin:0 auto;font-family:'Segoe UI',Helvetica,Arial,sans-serif;color:#1e293b;background:#ffffff;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:linear-gradient(135deg,#0ea5e9 0%,#38bdf8 100%);border-radius:16px 16px 0 0;">
          <tr>
            <td style="padding:32px 28px;">
              <h1 style="margin:0;font-size:26px;font-weight:700;color:#ffffff;">📦 Order Processing</h1>
              <p style="margin:16px 0 0;color:#bae6fd;font-size:14px;">Hi <strong style="color:#ffffff;">{{user.name}}</strong>, we're preparing your order!</p>
            </td>
          </tr>
        </table>
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border:1px solid #e2e8f0;border-top:none;padding:28px;">
          <tr><td>
            <p style="font-size:14px;color:#475569;">Order <strong>#{{order.number}}</strong> is now being processed and will be shipped soon.</p>
            <p style="font-size:13px;color:#6b7280;margin-top:8px;">We'll send you another email with tracking information once it ships.</p>
            <div style="margin-top:20px;">{{order.itemsHtml}}</div>
          </td></tr>
        </table>
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 16px 16px;">
          <tr><td style="padding:24px 28px;text-align:center;">
            <p style="margin:0;font-size:13px;color:#94a3b8;">Questions? Reply to this email.</p>
          </td></tr>
        </table>
      </div>
    `,
  },
  {
    key: "order.cancelled",
    label: "Order Cancelled",
    description: "Sent when an order is cancelled.",
    defaultSubject: "Order #{{order.number}} has been cancelled",
    defaultHtml: `
      <div style="max-width:640px;margin:0 auto;font-family:'Segoe UI',Helvetica,Arial,sans-serif;color:#1e293b;background:#ffffff;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:linear-gradient(135deg,#dc2626 0%,#ef4444 100%);border-radius:16px 16px 0 0;">
          <tr>
            <td style="padding:32px 28px;">
              <h1 style="margin:0;font-size:26px;font-weight:700;color:#ffffff;">Order Cancelled</h1>
              <p style="margin:16px 0 0;color:#fecaca;font-size:14px;">Hi <strong style="color:#ffffff;">{{user.name}}</strong>, your order has been cancelled.</p>
            </td>
          </tr>
        </table>
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border:1px solid #e2e8f0;border-top:none;padding:28px;">
          <tr><td>
            <p style="font-size:14px;color:#475569;">Order <strong>#{{order.number}}</strong> has been cancelled.</p>
            <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:16px;margin:16px 0;">
              <p style="margin:0;font-size:14px;color:#dc2626;font-weight:600;">What happens next?</p>
              <ul style="margin:8px 0 0;padding-left:20px;color:#6b7280;font-size:13px;">
                <li>If you paid, a refund will be processed within 5-10 business days.</li>
                <li>If you have questions, please reply to this email.</li>
              </ul>
            </div>
            <div style="margin-top:20px;">{{order.itemsHtml}}</div>
          </td></tr>
        </table>
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 16px 16px;">
          <tr><td style="padding:24px 28px;text-align:center;">
            <p style="margin:0;font-size:13px;color:#94a3b8;">We're sorry to see this order cancelled. We hope to serve you again soon!</p>
          </td></tr>
        </table>
      </div>
    `,
  },
  {
    key: "order.invoice",
    label: "Order Invoice",
    description: "Invoice sent manually by admin to customer.",
    defaultSubject: "Invoice for Order #{{order.number}} - SalonTraining",
    defaultHtml: `
      <div style="max-width:640px;margin:0 auto;font-family:'Segoe UI',Helvetica,Arial,sans-serif;color:#1e293b;background:#ffffff;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);border-radius:16px 16px 0 0;">
          <tr>
            <td style="padding:32px 28px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td>
                    <p style="margin:0 0 4px;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:#94a3b8;">INVOICE</p>
                    <h1 style="margin:0;font-size:26px;font-weight:700;color:#ffffff;">Order #{{order.number}}</h1>
                  </td>
                  <td style="text-align:right;vertical-align:top;">
                    <div style="display:inline-block;background:{{order.statusColor}};border-radius:24px;padding:6px 14px;">
                      <span style="color:#ffffff;font-size:12px;font-weight:600;">{{order.status}}</span>
                    </div>
                  </td>
                </tr>
              </table>
              <p style="margin:16px 0 0;color:#cbd5e1;font-size:14px;">Hi <strong style="color:#ffffff;">{{user.name}}</strong>, here is your invoice.</p>
            </td>
          </tr>
        </table>

        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border:1px solid #e2e8f0;border-top:none;padding:28px;">
          <tr><td>
            {{order.freeOrderNote}}
            
            <h2 style="margin:0 0 16px;font-size:15px;font-weight:700;color:#0f172a;text-transform:uppercase;letter-spacing:0.08em;">Order Details</h2>
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              {{order.itemsHtml}}
            </table>

            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;background:#f8fafc;border-radius:12px;">
              <tr><td style="padding:20px;">
                <table width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="padding:6px 0;font-size:14px;color:#64748b;">Subtotal</td>
                    <td style="padding:6px 0;font-size:14px;color:#0f172a;text-align:right;font-weight:500;">\${{order.totals.items}}</td>
                  </tr>
                  <tr>
                    <td style="padding:6px 0;font-size:14px;color:#64748b;">Shipping</td>
                    <td style="padding:6px 0;font-size:14px;color:#0f172a;text-align:right;font-weight:500;">\${{order.totals.shipping}}</td>
                  </tr>
                  {{order.discountHtml}}
                  <tr>
                    <td colspan="2" style="padding-top:12px;border-top:2px dashed #cbd5e1;"></td>
                  </tr>
                  <tr>
                    <td style="padding:8px 0;font-size:18px;font-weight:700;color:#0f172a;">Total</td>
                    <td style="padding:8px 0;font-size:22px;font-weight:700;color:#0f172a;text-align:right;">\${{order.totals.grand}}</td>
                  </tr>
                </table>
              </td></tr>
            </table>

            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:20px;">
              <tr>
                <td width="48%" style="vertical-align:top;">
                  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0;">
                    <tr><td style="padding:18px;">
                      <p style="margin:0 0 10px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.1em;">📍 Shipping To</p>
                      <p style="margin:0;font-size:14px;font-weight:600;color:#0f172a;">{{order.shippingName}}</p>
                      <p style="margin:6px 0 0;font-size:13px;color:#475569;line-height:1.5;white-space:pre-line;">{{order.shippingAddress}}</p>
                    </td></tr>
                  </table>
                </td>
                <td width="4%"></td>
                <td width="48%" style="vertical-align:top;">
                  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0;">
                    <tr><td style="padding:18px;">
                      <p style="margin:0 0 10px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.1em;">📧 Contact</p>
                      <p style="margin:0;font-size:13px;color:#475569;"><strong>Email:</strong> {{order.contactEmail}}</p>
                      <p style="margin:6px 0 0;font-size:13px;color:#475569;"><strong>Phone:</strong> {{order.contactPhone}}</p>
                    </td></tr>
                  </table>
                </td>
              </tr>
            </table>
          </td></tr>
        </table>

        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 16px 16px;">
          <tr><td style="padding:24px 28px;text-align:center;">
            <p style="margin:0 0 8px;font-size:14px;color:#475569;">Thank you for shopping with SalonTraining!</p>
            <p style="margin:0;font-size:13px;color:#94a3b8;">Questions? Reply to this email or contact support@salontraining.com</p>
          </td></tr>
        </table>
      </div>
    `,
  },
];

