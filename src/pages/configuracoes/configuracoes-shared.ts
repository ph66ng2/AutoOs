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
  host: "hostmail.bmitag.com.br",
  port: 465,
  username: "bmitag@bmitag.com.br",
  from_name: "BMI Tag",
  from_email: "bmitag@bmitag.com.br",
  use_tls: true,
};
