export type EmailEventKey =
  | "auth.otp"
  | "auth.registered"
  | "auth.login"
  | "auth.password-reset"
  | "admin.recycle-bin-warning"
  | "listing.submitted"
  | "listing.approved"
  | "listing.rejected"
  | "listing.edit-requested"
  | "listing.updated"
  | "job.submitted"
  | "job.approved"
  | "job.rejected";

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
];

