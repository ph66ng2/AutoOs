export interface SmtpFormValues {
  host: string;
  port: number;
  username: string;
  from_name: string;
  from_email: string;
  use_tls: boolean;
  password: string;
}

export interface WhatsappFormValues {
  provider: string;
  api_url: string;
  token: string;
}

export const SMTP_DEFAULTS: Omit<SmtpFormValues, "password"> = {
  host: "",
  port: 465,
  username: "",
  from_name: "",
  from_email: "",
  use_tls: true,
};
