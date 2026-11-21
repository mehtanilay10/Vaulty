export interface PasswordCredential {
  id: string;
  vaultId: string;
  name: string;
  username: string;
  url?: string | null;
  password?: string | null;
  netbankPassword?: string | null;
  atmPin?: string | null;
  upiPin?: string | null;
  mobileAppPin?: string | null;
  mobileTransactionPin?: string | null;
  isFavorite: boolean;
  icon?: string | null;
  iconColor?: string | null;
  createdAt: string;
  updatedAt: string;
  lastAccessedAt?: string | null;
}

export interface AppCredential extends PasswordCredential {
  type: "APP";
}

export interface BankCredential extends PasswordCredential {
  type: "BANK";
}

export type Credential = AppCredential | BankCredential;
