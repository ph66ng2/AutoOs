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
  host: "smtp.gmail.com",
  port: 465,
  username: "bmi.tag.ssa@gmail.com",
  from_name: "BMI Tag",
  from_email: "bmi.tag.ssa@gmail.com",
  use_tls: true,
};
